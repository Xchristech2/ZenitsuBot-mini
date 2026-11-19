// pair.js — Pair site for Zenitsu-Bot
const express = require('express')
const path = require('path')
const pino = require('pino')
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const activeSockets = new Map()

app.post('/pair', async (req, res) => {
  try {
    let { phone } = req.body
    if (!phone) return res.status(400).json({ error: 'Phone number required' })

    phone = phone.replace(/\D/g, '')
    if (phone.length < 10) return res.status(400).json({ error: 'Invalid phone number' })

    if (activeSockets.has(phone)) {
      return res.json({ message: 'Pairing already in progress. Check WhatsApp.' })
    }

    const { state, saveCreds } = await useMultiFileAuthState('./session')

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.0']
    })

    activeSockets.set(phone, sock)
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') {
        console.log(`✅ Connected: ${phone}`)
        activeSockets.delete(phone)
      }
      if (update.connection === 'close') {
        activeSockets.delete(phone)
      }
    })

    await delay(2000)

    if (sock.authState.creds.registered) {
      return res.json({ message: 'Already paired.' })
    }

    const code = await sock.requestPairingCode(phone)
    const formatted = code?.match(/.{1,4}/g)?.join('-') || code

    res.json({
      success: true,
      pairingCode: formatted,
      instructions: 'WhatsApp → Linked Devices → Link with phone number → enter code'
    })
  } catch (err) {
    console.error('Pair error:', err)
    res.status(500).json({ error: err.message || 'Pairing failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Pair site running on port ${PORT}`)
})