// voice-transcriber.ts
// Downloads a WhatsApp voice note (audio/ogg, Opus codec) from its Twilio
// media URL and transcribes it to text.
//
// Uses the existing Whisper integration. Provider/media errors return null; no fake transcript.

import axios from 'axios'
import FormData from 'form-data'

export async function transcribeVoiceNote(mediaUrl: string): Promise<string | null> {
  let url:URL
  try{url=new URL(mediaUrl)}catch{return null}
  if(url.protocol!=='https:'||url.hostname!=='api.twilio.com'||!url.pathname.startsWith('/2010-04-01/Accounts/'+process.env.TWILIO_ACCOUNT_SID+'/Messages/'))return null
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('transcribeVoiceNote: OPENAI_API_KEY is not set — cannot transcribe')
    return null
  }

  try {
    // Twilio media URLs require the same Basic Auth as image downloads
    // (see image-analyzer.ts's analyzeImage for the identical pattern).
    const audioResponse = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength:10*1024*1024, maxBodyLength:10*1024*1024, maxRedirects:0,
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!,
      },
    })
    const buffer = Buffer.from(audioResponse.data as ArrayBuffer)

    const form = new FormData()
    form.append('file', buffer, { filename: 'voice-note.ogg', contentType: 'audio/ogg' })
    form.append('model', 'whisper-1')

    const transcriptionResponse = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        timeout: 20000,
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
      }
    )

    const transcript = String(transcriptionResponse.data?.text || '').trim()
    return transcript.length > 0 ? transcript : null
  } catch (err) {
    console.error('transcribeVoiceNote: provider or media request failed')
    return null
  }
}
