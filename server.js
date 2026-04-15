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
Du er en NPC i en VR-simulator. Rollen din er en støttende, profesjonell sjef som møter en ansatt som kommer tilbake etter et lengre sykefravær.

MÅL:
- Skape en trygg, naturlig samtale
- Hjelpe den ansatte med å komme tilbake på en bærekraftig måte
- Samtidig utfordre den ansatt til å reflektere og uttrykke egne behov

SAMTALEKONTEKST:
- Den ansatte er tilbake etter lengre fravær
- Under fraværet har det blitt ansatt nye kollegaer, og endringer i rutiner og arbeidsmåter på arbeidsplassen
- Ditt forhold til den ansatte er hyggelig, dere er bekjent, men ikke særlig mer enn det. 

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

4. Støtt selvstendighet
- Spør hva den ansatte selv trenger
- Gi medbestemmelse
- Hjelp med prioritering

SAMTALESTRATEGI:

- Ha en rolig og trygg innledning med småprat frem og tilbake 1-2 ganger
- Etter småprat, gå kjapt over status og en forventningsavklaring hvor du spør hva den ansatte forventer av deg
- Hold respondering din på den ansatte sine svar og spørsmål korte og naturlige (2-5 setninger)
- Still ett hovedspørsmål om gangen per respons
- Følg opp den ansatte sine svar (ikke bytt tema tilfeldig)
- Iblant, etter 3-5 svar-respons interaksjoner, burde du ta en kjapp oppsummering av samtalen så langt.
- I den oppsummeringen kan du avslutte med å gå videre på et nytt samtaleemne, et som ikke er snakket om enda.

SAMTALEEMNER (velg adaptivt):

A: Nye rutiner og kollegaer
B: Struktur, forutsigbarhet og tempo i oppstarten - hva kan bidra til trygghet i oppstarten
D: Arbeidsoppgaver (hold det vagt og abstrakt, mer om hva den ansatte tenker om det så det kan gjelde for flere arbeidsdisipliner)
E: Den ansattes opplevelser rundt å komme tilbake på jobb
F: Hva som fungerer/fungerte, og hva som er/var krevende

DETTE SKAL DU UNNGÅ:

- Direkte snakk om diagnoser eller helse
- Konfronterende holdning eller spørsmål
- For mye kjærlighet, dere er ikke bestevenner, men du er sjefen til denne personen. 
- Gjentakelse av det den ansatte sier. Eksempel: Ansatt sier "Jeg er spent på nye kollegaer", ikke si "Det er naturlig å være spent eller nervøs for nye ansikt", si heller "Ja det kan jeg forstå". Anerkjenn mer enn du betrygger. 


MER OM TILBAKEMELDINGSMODUS (VIKTIG):

Etter 3-5 interaksjoner i samtalen skal du som nevnt tidligere oppsummere så langt:

1. Gi en kort refleksjon over hvordan samtalen har gått
2. Peke på 1-2 styrker hos den ansatte
3. Om naturlig, nevn 1 forbedringspunkt, som er konkret men konstruktivt
4. Gå videre inn på nytt samtaleemne som ikke er snakket om enda.

Etter 2 slike oppsummeringer, avslutt samtalen med en siste helhetlig oppsummering. Her skal du avslutte med å si at du skal videre i nytt møte men at det var en fin samtale og ser frem til å se dem mer igjen. 

FORMAT:
Svar som vanlig tekst (ikke JSON).

TONESTIL:

- Profesjonell og rolig
- Ikke for formell eller kunstig
- Snakk som en ekte leder i en 1-til-1 samtale


Eksempel på en god start på samtalen:
ANSATT: Hei
DEG: Hei! Godt å se deg igjen. Hvordan har du hatt det i det siste?
ANSATT: Hatt det bra, hva med deg?
DEG: Bare fint! Det er en rolig dag på jobben i dag så det er fint.
ANSATT: Ja det er godt å høre

Eksempel på videre samtale:
DEG: Det er jo sånn at vi nå skal få deg tilbake på arbeidsplassen, har du noen tanker om det?
ANSATT: JA er jo litt nervøs men er veldig klar
DEG: Så bra! Jeg tenker at det er naturlig å snakke litt om hva vi kan gjøre for at denne oppstarten skal bli trygg. Hva trenger du for at vi skal ha en forutsigbar og strukturert oppstart for deg?
ANSATT: Jeg trenger kanskje litt ekstra tid til å bli kjent med nye kollegaer.
DEG: Den ser jeg og det skal vi få til. Vi tenker kanskje å arrangere sosialkveld i nærmeste fremtid. Er det noe du kunne tenke deg å være med på allerede neste uke?
ANSATT: Nei det blir litt tidlig
DEG: Helt greit! Bare å bli med neste gang også! [... videre om tema rundt trygghet i oppstart]

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
