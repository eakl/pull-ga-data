#!/usr/bin/env node
'use strict'

const P = require('bluebird')
const Fs = require('fs')
const Assert = require('assert')
const Moment = require('moment')
const Chalk = require('chalk')
const Csv = require('fast-csv')
const Google = require('googleapis')
const Analytics = Google.analyticsreporting('v4')
const Argv = require('minimist')(process.argv.slice(2))

const oauth2Client = new Google.auth.OAuth2()
const PAGE_SIZE = 5000

Assert(process.env.GOOGLE_API_ANALYTICS, 'Missing env `GOOGLE_API_JSON`')

if (require.main === module) {
  const params = parseOpts(Argv)
  run(params)
}

function getJwtClient () {
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly'
  ]
  const credentials = require(process.env.GOOGLE_API_ANALYTICS)

  return new Google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    scopes,
    null
  )
}

function hasNextPage (data, query) {
  const pageToken = data.reports[0].nextPageToken
  if (!pageToken) {
    return false
  }
  query.resource.reportRequests[0].pageToken = pageToken
  console.log(`Set page token to ${query.resource.reportRequests[0].pageToken}`)
  return true
}

function getDataFetcher (query, params) {
  let rows = []
  let reportFileName = ''

  if (params.csv) {
    reportFileName = `./${params.reportName}.csv`
    console.log(`Creating report ${reportFileName}`)
  }

  const batchGet = () => {
    Analytics.reports.batchGet(query, (err, data) => {
      if (err) {
        return console.error(err)
      }

      if (!data.reports[0].data.rows) {
        return console.log('No results!')
      }
      if (params.cleanMail) {
        data.reports[0].data.rows = cleanMail(data.reports[0].data.rows, params.cleanMail)
      }
      if (params.cleanUid) {
        data.reports[0].data.rows = cleanUid(data.reports[0].data.rows, params.cleanUid)
      }

      const numRows = data.reports[0].data.rows.length
      if (numRows) {
        console.log(`Fetched ${numRows} rows from GA.`)
        rows = rows.concat(convertGoogleReport(data))

        // Continue if there’s a next page.
        if (hasNextPage(data, query)) {
          batchGet()
        // Otherwise we’re done.
        } else if (rows.length) {
          if (params.csv) {
            console.log(`Writing ${rows.length} rows to ${reportFileName}.`)

            writeCsv(rows, reportFileName)
            .then(() => console.log('It’s a Done Deal.'))
          }
          else {
            return rows
          }
        }
      }
    })
  }
  return batchGet
}

function run (opts) {
  const query = queryGenerator(opts)

  console.log(`
  Generated Query:

    GA ID: ${Chalk.white(opts.viewId)}
    From:  ${Chalk.white(opts.from)}
    To:    ${Chalk.white(opts.to)}

  Query: ${JSON.stringify(query, false, 2)}
  `)

  getJwtClient().authorize((err, token) => {
    if (err) {
      return console.log(err)
    }
    oauth2Client.setCredentials(token)
    // Fetch data until we’re done.
    getDataFetcher(query, opts)()
  })
}

function Usage (error) {
  if (error) {
    console.log(`
    ${Chalk.red.bold(error)}
    `)
  }

  console.log(`
  Usage: node <script> [options]

    --id            GA Account ID, e.g. ga:123456789 (${Chalk.red('required')}).

    --from          Start exporting from ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (${Chalk.red('required')}).

    --to            Stop exporting at ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (${Chalk.red('required')}).
                    If not provided, defaults as of ${Chalk.white('<today>')}

    --dimensions    GA dimension fields (comma separated) (${Chalk.red('required')}).
                    e.g. --dimensions ga:date,ga:country,ga:city

    --metrics       GA metric fields (comma separated) (${Chalk.red('required')}).
                    e.g. --metrics ga:uniqueEvents,ga:totalEvents

    --sortby        GA dimension fields (comma separated) (optional).
                    e.g. ga:date,ga:country

        ${Chalk.white('--order')}     ASC | DESC (comma separated) (${Chalk.red('required if --sortby is provided')}).
                    e.g. --sortby ga:date,ga:country --order ASC,DESC
                    e.g. --sortby ga:date,ga:country --order DESC

    --filter        Dimension filter: ${Chalk.white('<dimension>,<operator>,<expression>')} (comma separated) (optional).
                    <operator>: REGEXP / BEGINS_WITH / ENDS_WITH / PARTIAL / EXACT / IN_LIST
                    e.g. --filter ga:eventAction,EXACT,Completed-SignUp
                    e.g. --filter ga:eventAction,IN_LIST,Completed-SignUp,Press Signup,Completed-SignUp-Google
                    e.g. --filter ga:eventLabel,NOT/BEGINS_WITH,UID:5567cf05870e405f53cdc5a8:

    --cleanmail     Clean the data to get Emails only: ${Chalk.white('<dimension_position>')} (optional).
                    e.g. --cleanmail 3

    --cleanuid      Clean the data to get UID only: ${Chalk.white('<dimension_position>')} (optional).
                    e.g. --cleanuid 1 (optional)

    --name          Name of the report (optional).

    --csv           Export the result as a CSV file (optional).
  `)
  process.exit(0)
}

function parseOpts (opts) {
  const id = opts['id'] || Usage('--id is required')
  let from = opts['from'] || Usage('--from is required')
  let to = opts['to']
  let dimensions = opts['dimensions'] || Usage('--dimensions is required')
  let metrics = opts['metrics'] || Usage('--metrics is required')
  let sortby = opts['sortby'] ? opts['sortby'] : false
  let order = (opts['sortby'] && opts['order']) ? opts['order'] : 'ASC'
  const filter = opts['filter']
  const cleanMail = opts['cleanmail']
  const cleanUid = opts['cleanuid']
  const reportName = opts['name'] || opts['reportName'] || `${from}-${to}-report`
  const csv = opts['csv']

  const fromIsValid = Moment(from, 'YYYY-MM-DD').isValid()
  const toIsValid = Moment(to, 'YYYY-MM-DD').isValid()
  if (!fromIsValid) {
    Usage('Invalid date format for --from')
  }
  if (to && !toIsValid) {
    Usage('Invalid date format for --to')
  }
  from = Moment(from, 'YYYY-MM-DD').format('YYYY-MM-DD')
  to = to ? Moment(to, 'YYYY-MM-DD').format('YYYY-MM-DD') : Moment().format('YYYY-MM-DD')

  dimensions = dimensions
  .split(',')
  .map((x) => ({ name: x }))

  metrics = metrics
  .split(',')
  .map((x) => ({ expression: x }))

  if (sortby && !order) {
    for (let i = 0; i < sortby.split(',').length; ++i) {
      order += ',' + order
    }
  }
  if (!sortby) {
    order = null
  }

  if (sortby) {
    sortby = sortby
    .split(',')
    .map((x, i) => ({
      'fieldName': x,
      'sortOrder': order.split(',')[i].replace('ASC', 'ASCENDING').replace('DESC', 'DESCENDING')
    }))
  }

  const params = {
    viewId: id,
    from: from,
    to: to,
    dimensions: dimensions,
    metrics: metrics,
    sortby: sortby,
    reportName,
    csv
  }

  if (filter) {
    const filterParts = filter.split(',')
    let operator = filterParts[1]
    let not = false
    if (operator.includes('NOT/')) {
      not = true
      operator = operator.replace('NOT/', '')
    }
    params.filters = [{
      name: filterParts[0],
      not,
      operator,
      expression: filterParts.slice(2)
    }]
  }

  if (cleanMail) {
    params.cleanMail = Number(cleanMail) - 1
  }
  if (cleanUid) {
    params.cleanUid = Number(cleanUid) - 1
  }

  return params
}

function queryGenerator (params) {
  const query = {
    'headers': { 'Content-Type': 'application/json' },
    'auth': oauth2Client,
    'resource': {
      'reportRequests': [
        {
          'viewId': params.viewId,
          'dateRanges': [
            {
              'startDate': params.from,
              'endDate': params.to
            }
          ],
          'dimensions': params.dimensions,
          'metrics': params.metrics,
          'orderBys': params.sortby,
          'pageSize': PAGE_SIZE,
          'pageToken': params.pageToken,
          'includeEmptyRows': false,
          'hideTotals': true,
          'hideValueRanges': true
        }
      ]
    }
  }

  if (params.filters) {
    query.resource.reportRequests[0].dimensionFilterClauses = [{
      operator: 'AND',
      filters: params.filters.map((x) => createFilterClause(x))
    }]
  }

  return query
}

function createFilterClause (opts) {
  return {
    dimensionName: opts.name,
    not: false,
    operator: opts.operator.toUpperCase(),
    expressions: Array.isArray(opts.expression) ? opts.expression : [opts.expression],
    caseSensitive: true
  }
}

function convertGoogleReport (json) {
  const dimensionHeaders = json.reports[0].columnHeader.dimensions
  const metricHeaders = json.reports[0].columnHeader.metricHeader.metricHeaderEntries.map((x) => x.name)

  return json.reports[0].data.rows.map((x) => {
    const obj1 = dimensionHeaders.reduce((d, dh, i) => {
      d[dh] = x.dimensions[i]
      return d
    }, { })

    return metricHeaders.reduce((m, mh, i) => {
      m[mh] = x.metrics[0].values[i]
      return m
    }, obj1)
  })
}

function cleanMail (data, idx) {
  const re = /.*(?:,|=)([\w\-\+]+(\.[\w\-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9]+)*(\.[A-Za-z0-9]{2,}))(?:.*)/
  return data.map((x) => {
    const cleanEmail = x.dimensions[idx].replace(re, '$1')
    const newDimensions = x.dimensions.slice(0, idx)
    .concat(cleanEmail)
    .concat(x.dimensions.slice(idx + 1))
    const newObject = { dimensions: newDimensions }
    return Object.assign(x, newObject)
  })
  .filter((x) => {
    return x.dimensions[idx].match(/.*@.*/)
  })
}

function cleanUid (data, idx) {
  const re = /.*(UID:(\w:)?(\w{24})).*/
  return data
  .filter((x) => {
    return x.dimensions[idx].match(/UID:/)
  })
  .map((x) => {
    const cleanUid = x.dimensions[idx].replace(re, '$3')
    const newDimensions = x.dimensions.slice(0, idx)
    .concat(cleanUid)
    .concat(x.dimensions.slice(idx + 1))
    const newObject = { dimensions: newDimensions }
    return Object.assign(x, newObject)
  })
}

function writeCsv (rows, file) {
  return new P((resolve) => {
    const stream = Fs.createWriteStream(file)
    Csv
    .write(rows, { headers: true })
    .on('error', (err) => console.error(err))
    .on('finish', resolve)
    .pipe(stream)
  })
}

module.exports = {
  run,
  parseOpts
}
