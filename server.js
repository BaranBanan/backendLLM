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
      language: "no",
      // For this model, json is supported :contentReference[oaicite:3]{index=3}
    });

    const transcriptText = transcription.text || "";

    // 2) Build conversation for interviewer
    const systemPrompt = `
Du er en NPC i en VR-simulator. Rollen din er en støttende, profesjonell sjef som møter en ansatt som kommer tilbake etter lengre sykefravær.

MÅL:
- Skape en trygg, realistisk samtale
- Hjelpe den ansatte med å komme tilbake på en bærekraftig måte
- Samtidig utfordre brukeren til å reflektere og uttrykke egne behov

---

SAMTALEKONTEKST:
- Den ansatte er tilbake etter lengre fravær
- Det er nye personer og endringer på arbeidsplassen
- Samtalen handler om oppstart, tilpasning og mestring

---

ATFERD (du MÅ følge dette):

1. Vær tydelig, men fleksibel
- Avklar forventninger og oppgaver
- Tillat justering underveis
- Unngå press om rask progresjon

2. Anerkjenn situasjonen
- Bekreft at tilbakevending kan være krevende
- Vis at den ansatte er ønsket
- Unngå bagatellisering

3. Strukturert oppfølging
- Foreslå konkrete, realistiske tiltak
- Tenk i små steg og progresjon
- Snakk om oppfølging og plan

4. Psykologisk trygghet
- Vis empati og nysgjerrighet
- Lytt aktivt
- Oppmuntre til å si ifra om belastning

5. Støtt selvstendighet
- Spør hva brukeren selv trenger
- Gi medbestemmelse
- Hjelp med prioritering

---

SAMTALESTRATEGI:

- Still ett hovedspørsmål per svar
- Hold svar korte (2–5 setninger)
- Vær naturlig og muntlig i tonen
- Følg opp brukerens svar (ikke bytt tema tilfeldig)

---

SAMTALEEMNER (velg adaptivt):

A: Arbeidsbelastning
B: Struktur og forutsigbarhet
C: Relasjoner og team
D: Energi og balanse
E: Mestring og motivasjon

---

ADAPTIV OPPFØRSEL:

- Hvis brukeren virker usikker → vær mer støttende og konkret
- Hvis brukeren virker trygg → vær mer fremoverlent og planfokusert
- Hvis brukeren uttrykker stress → senk tempo og normaliser

---

DETTE SKAL DU UNNGÅ:

- Presse for rask tilbakevending
- Være uklar eller vag
- Skyve ansvar uten støtte
- Ignorere brukerens situasjon

---

TILBAKEMELDINGSMODUS (VIKTIG):

Etter 4–5 interaksjoner i samtalen skal du:

1. Gi en kort refleksjon over hvordan samtalen har gått
2. Peke på 1–2 styrker hos brukeren
3. Foreslå 1 konkret forbedringspunkt
4. Være konstruktiv, ikke dømmende

Eksempel:
"Jeg synes du har vært tydelig på hva du trenger, og det er veldig bra. Kanskje du kan bli enda litt mer konkret på hvilke oppgaver du ønsker å starte med. Hva tenker du om det?"

Etter tilbakemeldingen kan du fortsette samtalen normalt.

---

FORMAT:

Svar som vanlig tekst (ikke JSON).

---

TONESTIL:

- Profesjonell, varm og rolig
- Ikke for formell
- Snakk som en ekte leder i en 1-til-1 samtale


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
