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
    case 'signups':
      return {
        id: 'ga:93825837',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventCategory,ga:eventLabel',
        metrics: 'ga:uniqueEvents',
        sortby: 'ga:uniqueEvents',
        order: 'DESC',
        // cleanmail: 3,
        filter: 'ga:eventAction,IN_LIST,Completed-SignUp,Press Signup',
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'onboarding':
      return {
        id: 'ga:131470396',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventAction,ga:eventLabel',
        metrics: 'ga:totalEvents,ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'DESC',
        // cleanmail: 3,
        filter: 'ga:eventAction,IN_LIST,page:signup:select:language,page:signup:create:profile,page:signup:create:company,page:signup:invite:colleagues,page:signup:onboarding:complete',
        reportName: `${from}-${to}-${report}`,
        csv: true
      }
    case 'tutorial':
      return {
        id: 'ga:131470396',
        from: from,
        to: to,
        dimensions: 'ga:date,ga:eventAction,ga:eventLabel',
        metrics: 'ga:totalEvents,ga:uniqueEvents',
        sortby: 'ga:date',
        order: 'DESC',
        cleanuid: 3,
        filter: 'ga:eventAction,IN_LIST,page:tutorial:step1:welcome,page:tutorial:click:show-me-how,page:tutorial:click:the-project,page:tutorial:click:tasklists-got-it,page:tutorial:finish:dragging,page:tutorial:click:tasks-got-it,page:tutorial:finish:completing-tasks,page:tutorial:click:get-started',
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

    --report        Extracts the given report (${Chalk.red('required')})
        signups          - Signups (regular and Google button)
        onboarding       - Onboarding tracking
        tutorial         - Tutorial tracking

    --from          Start exporting from ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (${Chalk.red('required')})

    --to            Stop exporting at ${Chalk.white('<date>')}, format ${Chalk.white('YYYY-MM-DD')} (${Chalk.white('optional')})
                    If not provided, defaults as of ${Chalk.white('<today>')}

  Example: ./script.js --report signups --from 2016-09-01 --to 2016-09-31
  `)
  process.exit(0)
}
