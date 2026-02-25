using System;
using System.IO;
using UnityEngine;

[RequireComponent(typeof(AudioSource))]
public class MicRecorder : MonoBehaviour
{
    [Header("Recording")]
    public int sampleRate = 16000;          // 16000 is great for speech
    public int maxRecordSeconds = 20;       // safety cap
    public bool playBackAfterStop = true;  // for testing

    private AudioSource audioSource;
    private AudioClip recordingClip;
    private string micDevice;
    private bool isRecording;

    public byte[] LastWavBytes { get; private set; }
    public float LastDurationSeconds { get; private set; }

    void Awake()
    {
        audioSource = GetComponent<AudioSource>();

        if (Microphone.devices.Length == 0)
        {
            Debug.LogError("No microphone devices found.");
            return;
        }
        micDevice = Microphone.devices[0];
        Debug.Log("Using mic: " + micDevice);
    }

    public void StartRecording()
    {
        if (isRecording) return;
        if (string.IsNullOrEmpty(micDevice))
        {
            Debug.LogError("Mic device not set.");
            return;
        }

        // Start recording
        recordingClip = Microphone.Start(micDevice, false, maxRecordSeconds, sampleRate);
        isRecording = true;
        Debug.Log("Recording started...");
    }

    public void StopRecording()
    {
        if (!isRecording) return;

        // Figure out how many samples were recorded
        int samplePos = Microphone.GetPosition(micDevice);
        Microphone.End(micDevice);
        isRecording = false;

        if (recordingClip == null)
        {
            Debug.LogError("No recording clip.");
            return;
        }

        if (samplePos <= 0)
        {
            Debug.LogWarning("No audio captured (samplePos <= 0).");
            return;
        }

        // Copy only the recorded part into a new clip
        float[] samples = new float[samplePos * recordingClip.channels];
        recordingClip.GetData(samples, 0);

        AudioClip trimmedClip = AudioClip.Create(
            "TrimmedRecording",
            samplePos,
            recordingClip.channels,
            sampleRate,
            false
        );
        trimmedClip.SetData(samples, 0);

        LastDurationSeconds = (float)samplePos / sampleRate;

        // Convert to WAV bytes (16-bit PCM)
        LastWavBytes = WavUtility.FromAudioClip(trimmedClip);

        Debug.Log($"Recording stopped. Duration: {LastDurationSeconds:F2}s, WAV bytes: {LastWavBytes.Length}");

        if (playBackAfterStop)
        {
            audioSource.clip = trimmedClip;
            audioSource.Play();
        }
    }
}

/// <summary>
/// Minimal WAV encoder (16-bit PCM).
/// </summary>
public static class WavUtility
{
    public static byte[] FromAudioClip(AudioClip clip)
    {
        if (clip == null) throw new ArgumentNullException(nameof(clip));

        int channels = clip.channels;
        int sampleRate = clip.frequency;
        int sampleCount = clip.samples;

        float[] floatData = new float[sampleCount * channels];
        clip.GetData(floatData, 0);

        // Convert float [-1..1] to 16-bit PCM
        byte[] pcmData = new byte[floatData.Length * 2];
        int offset = 0;
        for (int i = 0; i < floatData.Length; i++)
        {
            short val = (short)Mathf.Clamp(floatData[i] * short.MaxValue, short.MinValue, short.MaxValue);
            pcmData[offset++] = (byte)(val & 0xff);
            pcmData[offset++] = (byte)((val >> 8) & 0xff);
        }

        // WAV header is 44 bytes
        byte[] wav = new byte[44 + pcmData.Length];
        using (var mem = new MemoryStream(wav))
        using (var writer = new BinaryWriter(mem))
        {
            // RIFF header
            writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + pcmData.Length);
            writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));

            // fmt chunk
            writer.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
            writer.Write(16);                 // PCM
            writer.Write((short)1);           // Audio format 1=PCM
            writer.Write((short)channels);
            writer.Write(sampleRate);
            int byteRate = sampleRate * channels * 2;
            writer.Write(byteRate);
            short blockAlign = (short)(channels * 2);
            writer.Write(blockAlign);
            writer.Write((short)16);          // bits per sample

            // data chunk
            writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));
            writer.Write(pcmData.Length);
            writer.Write(pcmData);
        }

        return wav;
    }
}
