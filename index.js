require('dotenv').config({ path: 'settings.env' })
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')

const routes = require('./routes')
const { init } = require('./src/whatsapp/wa')
const { taskSendUpdates } = require('./src/scheduleService')

const server = express()
server.use(cors())
server.use(bodyParser.urlencoded({ extended: false }))
server.use(express.json())

server.use('/server/api', routes)

server.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`)

    taskSendUpdates.start()
    return init()
})

