import { useState, useRef, useCallback } from 'react';
import api, { AnalyzeResult } from '../lib/api';
import { useUserId } from './useUserId';

declare global {
  interface Window {
    WebAudioRecorder: any;
  }
}

interface UseRecorderReturn {
  isRecording: boolean;
  isAnalyzing: boolean;
  result: AnalyzeResult | null;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: (targetText?: string, speakerName?: string, questionId?: string) => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const userId = useUserId();
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const targetTextRef = useRef<string | undefined>(undefined);
  const speakerNameRef = useRef<string | undefined>(undefined);
  const questionIdRef = useRef<string | undefined>(undefined);

  const startRecording = useCallback(async (targetText?: string, speakerName?: string, questionId?: string) => {
    try {
      setError(null);
      targetTextRef.current = targetText;
      speakerNameRef.current = speakerName;
      questionIdRef.current = questionId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { channelCount: 1, sampleRate: 48000 },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const input = audioContext.createMediaStreamSource(stream);

      const recorder = new window.WebAudioRecorder(input, {
        workerDir: '/lib/',
        encoding: 'wav',
        numChannels: 1,
      });
      recorderRef.current = recorder;

      recorder.onComplete = async (_rec: any, blob: Blob) => {
        setAudioBlob(blob);
        setIsAnalyzing(true);
        try {
          const analyzeResult = await api.analyze(blob, userId, targetTextRef.current, speakerNameRef.current, questionIdRef.current);
          setResult(analyzeResult);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Analysis failed — please try again');
        } finally {
          setIsAnalyzing(false);
        }
      };

      recorder.startRecording();
      setIsRecording(true);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setError('microphone_permission_denied');
      } else {
        setError('Could not access microphone');
      }
    }
  }, [userId]);

  const stopRecording = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks()[0]?.stop();
    }
    if (recorderRef.current) {
      recorderRef.current.finishRecording();
    }
    setIsRecording(false);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setAudioBlob(null);
    setError(null);
  }, []);

  return {
    isRecording,
    isAnalyzing,
    result,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
