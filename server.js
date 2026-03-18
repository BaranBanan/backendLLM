import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors()); // allow Unity to call localhost during dev

// Multer will keep the uploaded audio in memory (no files written)
const upload = multer({ storage: multer.memoryStorage() });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Optional: super-simple in-memory “conversation memory” by sessionId
const sessions = new Map(); // sessionId -> [{role, content}, ...]

app.post("/interview-turn", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded. Field name must be 'audio'." });
    }

    const sessionId = req.body.sessionId || "default";
    const jobTitle = req.body.jobTitle || "Software Engineer Intern";
    const difficulty = req.body.difficulty || "easy";
    const interviewType = req.body.interviewType || "behavioral";

    // 1) Speech -> text (transcription)
    // gpt-4o-mini-transcribe is a speech-to-text model :contentReference[oaicite:2]{index=2}
    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype }),
      // For this model, json is supported :contentReference[oaicite:3]{index=3}
    });

    const transcriptText = transcription.text || "";

    // 2) Build conversation for interviewer
    const systemPrompt = `
Du er "Sjefen" i en VR-treningssimulator.
Scenario: En ansatt kommer tilbake til sjefens kontor etter et lengre sykefravær. Teamet har endret seg (nye ansikter, nye rutiner). Sjefen vil sjekke om den ansatte er klar for oppgavene og hvordan vedkommende planlegger å komme ajour

MÅL:
- Modellere god ledelsesatferd (tydelig, men fleksibel).
- Skape psykologisk trygghet.
- Lage en konkret plan sammen (arbeidsmengde, progresjon, oppfølging).
- Reagere adaptivt på brukerens svar (mer støtte ved usikkerhet/overbelastning).

ATFERD (slik du skal oppføre deg):
1) Vær tydelig, men fleksibel:
   - Avklar forventninger, arbeidstid og oppgaver.
   - Inviter til justering underveis.
   - Ikke press raskere opptrapping enn avtalt.
2) Anerkjenn situasjonen:
   - Valider at tilbakevending kan være krevende.
   - Unngå bagatellisering.
   - Signalisér trygghet og at den ansatte er ønsket.
3) Aktiv og strukturert oppfølging:
   - Foreslå konkret, realistisk plan (små steg).
   - Avtal faste oppfølgingssamtaler.
   - Sjekk at tilrettelegging faktisk blir gjort.
4) Psykologisk trygghet:
   - Lytt, ikke avbryt.
   - Vis empati og nysgjerrighet.
   - Oppmuntre til å si ifra ved overbelastning.
5) Støtt selvstendighet og mestring:
   - Spør hva den ansatte selv opplever som hensiktsmessig.
   - Gi medbestemmelse over tempo og arbeidsinnhold.
   - Hjelp med prioritering og grensesetting.

SAMTALEEMNER (velg det som passer basert på svarene):
A) Arbeidsbelastning og oppgaver
B) Forutsigbarhet og struktur
C) Relasjoner og arbeidsmiljø (nye ansikter)
D) Energi, restitusjon og balanse
E) Mestring og motivasjon

VIKTIGE REGLER:
- Still ÉN tydelig spørsmåls-setning om gangen (maks 1–2 korte avsnitt).
- Bruk et rolig, profesjonelt, varmt språk.
- Ikke spør om medisinske detaljer eller diagnose. Hold det på funksjon/tilrettelegging.
- Ikke gi juridiske råd; hold deg til praktisk oppfølging.
- Avslutt ofte med et konkret neste steg ("Skal vi avtale ...?").

OUTPUTFORMAT:
Svar alltid i JSON med feltene:
{
  "say": "det du sier høyt",
  "question": "hovedspørsmålet (én setning)",
  "plan_suggestion": "kort forslag til neste steg/struktur (1–2 setninger)",
  "topic": "A|B|C|D|E"
}

Kun JSON. Ingen ekstra tekst.
`.trim();

    const history = sessions.get(sessionId) ?? [];
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: transcriptText },
    ];

 
   // 3) LLM response (FIXED version)
const completion = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: transcriptText },
  ],
});

const replyText =
  completion.choices?.[0]?.message?.content?.trim() ||
  "(No reply)";

    // Save a small rolling history
    const newHistory = [
      ...history,
      { role: "user", content: transcriptText },
      { role: "assistant", content: replyText },
    ].slice(-12); // keep last 12 messages
    sessions.set(sessionId, newHistory);

        // 4) Text-to-speech (TTS) for the interviewer reply
    const tts = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",           // we can try different voices later
      format: "mp3",            // mp3 is easiest to play in Unity
      input: replyText,
    });

    // tts is binary audio data
    const audioBuffer = Buffer.from(await tts.arrayBuffer());
    const replyAudioBase64 = audioBuffer.toString("base64");

    res.json({
      transcript: transcriptText,
      reply_text: replyText,
      reply_audio_base64: replyAudioBase64,
      reply_audio_format: "mp3",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
