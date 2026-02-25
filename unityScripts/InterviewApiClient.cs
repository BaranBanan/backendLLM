using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using TMPro;

public class InterviewApiClient : MonoBehaviour
{
    public MicRecorder micRecorder;
    public TMP_Text transcriptText;
    public TMP_Text replyText;

    public string endpointUrl = "http://localhost:3000/interview-turn";

    public void SendLastRecording()
    {
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
        var form = new WWWForm();
        form.AddBinaryData("audio", wavBytes, "recording.wav", "audio/wav");
        form.AddField("sessionId", "player1");

        using (UnityWebRequest req = UnityWebRequest.Post(endpointUrl, form))
        {
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError(req.error);
                yield break;
            }

            string json = req.downloadHandler.text;
            Debug.Log("Server response: " + json);

            InterviewResponse response =
                JsonUtility.FromJson<InterviewResponse>(json);

            transcriptText.text = response.transcript;
            replyText.text = response.reply_text;
        }
    }

    [Serializable]
    private class InterviewResponse
    {
        public string transcript;
        public string reply_text;
    }
}
