import { useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import RecordingView from './components/RecordingView';
import ResultsView from './components/ResultsView';
import ShareView from './components/ShareView';
import QuestionAnswerView from './components/QuestionAnswerView';
import QuestionResultsView from './components/QuestionResultsView';
import HistorySidebar from './components/HistorySidebar';
import MyQuestions from './components/MyQuestions';
import Leaderboard from './components/Leaderboard';
import AdminLoginModal from './components/AdminLoginModal';
import AdminPanel from './components/AdminPanel';
import { AnalyzeResult, Word } from './lib/api';
import api from './lib/api';
import { useUserId } from './hooks/useUserId';
import { useAdmin } from './hooks/useAdmin';
import { computeIeltsBand } from './lib/utils';

function MainPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const { isAdmin, login, getAdminToken } = useAdmin();
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [currentResult, setCurrentResult] = useState<AnalyzeResult | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [prefillText, setPrefillText] = useState<string>('');

  const handleResult = useCallback((result: AnalyzeResult, blob?: Blob) => {
    setCurrentResult(result);
    setAudioBlob(blob || null);
    setActiveRecordingId(result.id);
    setRefreshTrigger((n) => n + 1);
  }, []);

  const handleNewRecording = () => {
    setCurrentResult(null);
    setAudioBlob(null);
    setActiveRecordingId(null);
    setPrefillText('');
  };

  const handleSameRecording = () => {
    const text = currentResult?.example_text || currentResult?.text || '';
    setPrefillText(text);
    setCurrentResult(null);
    setAudioBlob(null);
    setActiveRecordingId(null);
  };

  const handleSelectRecording = async (id: string) => {
    try {
      const recording = await api.getRecording(id);
      const words: Word[] = JSON.parse(recording.words_json);
      const fluency = recording.fluency_json ? JSON.parse(recording.fluency_json) : null;
      setCurrentResult({
        id: recording.id,
        text: recording.text,
        words,
        score: recording.score,
        fluency,
        grammar: null,
        example_text: recording.example_text,
        ielts_band: computeIeltsBand(recording.score, fluency?.score ?? null, null),
      });
      setAudioBlob(null);
      setActiveRecordingId(id);
    } catch {
      // Handle error
    }
  };

  const handleDelete = async () => {
    if (!activeRecordingId) return;
    if (!confirm('Delete this recording and its audio?')) return;
    try {
      await api.deleteRecording(activeRecordingId, userId, getAdminToken() || undefined);
      setCurrentResult(null);
      setAudioBlob(null);
      setActiveRecordingId(null);
      setRefreshTrigger((n) => n + 1);
    } catch {
      // Handle error
    }
  };

  const handleAdminLogin = async (password: string): Promise<boolean> => {
    const valid = await login(password);
    if (valid) {
      setShowAdminLogin(false);
    }
    return valid;
  };

  const sidebar = (
    <HistorySidebar
      userId={userId}
      activeId={activeRecordingId}
      onSelectRecording={handleSelectRecording}
      refreshTrigger={refreshTrigger}
      onRefresh={() => setRefreshTrigger((n) => n + 1)}
    />
  );

  const leaderboard = <Leaderboard refreshTrigger={refreshTrigger} onSelectRecording={handleSelectRecording} />;

  const questionsSidebar = <MyQuestions userId={userId} refreshTrigger={refreshTrigger} />;

  if (currentResult) {
    return (
      <>
        <Layout
          sidebar={sidebar}
          questionsSidebar={questionsSidebar}
          rightPanel={leaderboard}
          isAdmin={isAdmin}
          onAdminLogin={() => setShowAdminLogin(true)}
          onAdminPanel={() => navigate('/admin')}
        >
          <ResultsView
            result={currentResult}
            audioBlob={audioBlob}
            onNewRecording={handleNewRecording}
            onSameRecording={handleSameRecording}
            onDelete={handleDelete}
          />
        </Layout>
        {showAdminLogin && (
          <AdminLoginModal onLogin={handleAdminLogin} onClose={() => setShowAdminLogin(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <Layout
        sidebar={sidebar}
        questionsSidebar={questionsSidebar}
        rightPanel={leaderboard}
        isAdmin={isAdmin}
        onAdminLogin={() => setShowAdminLogin(true)}
        onAdminPanel={() => navigate('/admin')}
      >
        <RecordingView onResult={handleResult} prefillText={prefillText} />
      </Layout>
      {showAdminLogin && (
        <AdminLoginModal onLogin={handleAdminLogin} onClose={() => setShowAdminLogin(false)} />
      )}
    </>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, logout, getAdminToken } = useAdmin();

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return <AdminPanel adminToken={getAdminToken() || ''} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/share/:id" element={<ShareView />} />
      <Route path="/q/:id" element={<QuestionAnswerView />} />
      <Route path="/q/:id/results" element={<QuestionResultsView />} />
    </Routes>
  );
}
