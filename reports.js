#!/usr/bin/env node
'use strict'

const Argv = require('minimist')(process.argv.slice(2))
const Moment = require('moment')
const Chalk = require('chalk')
const Google = require('./google')

const opts = getOpts(Argv)
const params = Google.parseOpts(opts)

Google.run(params)

function getOpts (opts) {
  const isReport = (opts['report'] && typeof opts['report'] !== 'boolean')
  const report = isReport ? opts['report'] : Usage('--report is required')
  let from = opts['from'] || Usage('--from is required')
  let to = opts['to']

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

  switch(report) {
    case 'nima':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventLabel,ga:adGroup,ga:country,ga:city,ga:deviceCategory,ga:sourceMedium',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'ASC',
        cleanmail: 1,
        filter: 'ga:eventAction,IN_LIST,Completed-SignUp,Completed-SignUp-Google,Press Signup',
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'campaign':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventLabel,ga:sourceMedium',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'ASC',
        cleanmail: 1,
        filter: 'ga:eventAction,IN_LIST,Completed-SignUp,Completed-SignUp-Google,Press Signup',
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'referral':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:source,ga:eventLabel',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:uniqueEvents',
        order: 'DESC',
        cleanmail: 2,
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'country':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventLabel,ga:country',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'DESC',
        cleanmail: 2,
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'device':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventLabel,ga:deviceCategory',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'DESC',
        cleanmail: 2,
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    default:
      Usage('Invalid report name')
      return
  }
}

function Usage (error) {
  if (error) {
    console.log(`
    ${Chalk.red.bold(error)}
    `)
  }

  console.log(`
  Usage: <script> [options]

    --report            Extracts the given report (${Chalk.red('required')})
        nima                - Nima report
        signup              - Signup report
        signup_google       - Signup (Google button) report
        campaign            - Campaign report
        referral            - Referral report
        country             - Country report
        device              - Device report

    --from              Start exporting from ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (${Chalk.red('required')})

    --to                Stop exporting at ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (optional)
                        If not provided, defaults as of ${Chalk.white('<today>')}

  Example: ./script.js --report campaign --from 2016-09-01 --to 2016-09-31
  `)
  process.exit(0)
}
