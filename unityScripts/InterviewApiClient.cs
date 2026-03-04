using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;
using TMPro;

public class InterviewApiClient : MonoBehaviour
{
    public MicRecorder micRecorder;
    public TMP_Text transcriptText;
    public TMP_Text replyText;
    public AudioSource audioSource;

    public string endpointUrl = "http://localhost:3000/interview-turn";

    private bool isSending = false;

    public void SendLastRecording()
    {
        if (isSending) return;

        if (micRecorder == null)
        {
            Debug.LogError("MicRecorder not assigned.");
            return;
        }

        var wav = micRecorder.LastWavBytes;
        if (wav == null || wav.Length == 0)
        {
            Debug.LogWarning("No recording available.");
            return;
        }

        StartCoroutine(PostAudio(wav));
    }

    private IEnumerator PostAudio(byte[] wavBytes)
    {
        isSending = true;

        var form = new WWWForm();
        form.AddBinaryData("audio", wavBytes, "recording.wav", "audio/wav");
        form.AddField("sessionId", "player1");

        using (UnityWebRequest req = UnityWebRequest.Post(endpointUrl, form))
        {
            req.timeout = 60;
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Request failed: {req.error}\nHTTP: {req.responseCode}\nBody: {req.downloadHandler.text}");
                if (replyText) replyText.text = $"Error (HTTP {req.responseCode})\n{req.downloadHandler.text}";
                isSending = false;
                yield break;
            }

            string json = req.downloadHandler.text;
            Debug.Log("Server response: " + json);

            InterviewResponse response = JsonUtility.FromJson<InterviewResponse>(json);

            if (transcriptText) transcriptText.text = response.transcript ?? "";
            if (replyText) replyText.text = response.reply_text ?? "";

            // Play TTS if provided
            if (!string.IsNullOrEmpty(response.reply_audio_base64) && audioSource != null)
            {
                yield return PlayBase64Mp3(response.reply_audio_base64);
            }
        }

        isSending = false;
    }

    private IEnumerator PlayBase64Mp3(string base64)
    {
        byte[] mp3Bytes;
        try
        {
            mp3Bytes = Convert.FromBase64String(base64);
        }
        catch (Exception e)
        {
            Debug.LogError("Failed to decode base64 audio: " + e.Message);
            yield break;
        }

        // Write to a temp file (Unity can easily load mp3 from a file URL)
        string path = Path.Combine(Application.persistentDataPath, "reply.mp3");
        File.WriteAllBytes(path, mp3Bytes);

        using (UnityWebRequest www = UnityWebRequestMultimedia.GetAudioClip("file://" + path, AudioType.MPEG))
        {
            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("Failed to load mp3 AudioClip: " + www.error);
                yield break;
            }

            AudioClip clip = DownloadHandlerAudioClip.GetContent(www);
            audioSource.Stop();
            audioSource.clip = clip;
            audioSource.Play();
        }
    }

    [Serializable]
    private class InterviewResponse
    {
        public string transcript;
        public string reply_text;

        public string reply_audio_base64;
        public string reply_audio_format;
    }
}