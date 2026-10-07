import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Home,
  BookOpen,
  FileCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Plus,
  PlusCircle,
  FolderPlus,
  CheckCircle,
  AlertTriangle,
  Upload,
  Eye,
  Trash,
  UserPlus,
  ArrowRight,
  TrendingUp,
  FileText,
  HelpCircle
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MathRenderer } from './components/MathRenderer';
import { ImageViewerWithBbox } from './components/ImageViewerWithBbox';

// Configure Axios defaults
// Cấu hình URL gọi tới Backend (Render hoặc Localhost)
axios.defaults.baseURL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`;

const DashboardContent: React.FC = () => {
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(
    window.location.hash ? window.location.hash.replace('#', '') : 'home'
  );

  useEffect(() => {
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== activeTab) {
      if (!currentHash) {
        window.history.replaceState(null, '', `#${activeTab}`);
      } else {
        window.history.pushState(null, '', `#${activeTab}`);
      }
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      setActiveTab(hash || 'home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Data State
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);

  // Form States
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newQuestionName, setNewQuestionName] = useState('');
  const [newQuestionContent, setNewQuestionContent] = useState('');
  const [rubricSteps, setRubricSteps] = useState<Array<{ stepIndex: number; latexContent: string; maxScore: number }>>([
    { stepIndex: 1, latexContent: '', maxScore: 0.25 }
  ]);
  const [enrollStudentEmail, setEnrollStudentEmail] = useState('');
  const [studentsList, setStudentsList] = useState<any[]>([]);

  // Student Upload States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');

  // Grading Override States
  const [overrideTotalScore, setOverrideTotalScore] = useState<number>(0);
  const [overrideSteps, setOverrideSteps] = useState<Array<{ stepEvaluationId: string; isMarkedIncorrect: boolean; teacherFeedback: string }>>([]);

  // UI Control States
  const [showCreateExamForm, setShowCreateExamForm] = useState(false);
  const [examSubTab, setExamSubTab] = useState<'questions' | 'students'>('questions');
  const [showAddQuestionForm, setShowAddQuestionForm] = useState(false);
  const [showEnrollStudentForm, setShowEnrollStudentForm] = useState(false);
  const [isEditingExam, setIsEditingExam] = useState(false);
  const [editExamTitle, setEditExamTitle] = useState('');
  const [selectedQuestionForSubmissions, setSelectedQuestionForSubmissions] = useState<any>(null);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);

  const formatScore = (num: number) => {
    const str = num.toString();
    return str.includes('.') ? str : num.toFixed(1);
  };

  // Fetch initial dashboard info
  const fetchExams = async () => {
    try {
      const res = await axios.get('/exams');
      setExams(res.data);
    } catch (err) {
      console.error('Failed to fetch exams', err);
    }
  };

  useEffect(() => {
    fetchExams();
    if (user?.role === 'TEACHER') {
      // Mock/fetch student list for enrollment
      setStudentsList([
        { id: 'student-uuid-1', name: 'Nguyễn Văn A', email: 'studentA@gmail.com' },
        { id: 'student-uuid-2', name: 'Trần Thị B', email: 'studentB@gmail.com' }
      ]);
    }
  }, [user]);

  // Actions
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle) return;
    try {
      await axios.post('/exams', { title: newExamTitle });
      setNewExamTitle('');
      fetchExams();
    } catch (err) {
      alert('Không thể tạo kỳ thi');
    }
  };

  const handleSelectExam = async (examId: string) => {
    try {
      const res = await axios.get(`/exams/${examId}`);
      const examData = res.data;
      setSelectedExam(examData);
      setEditExamTitle(examData.title);
      setIsEditingExam(false);
      setExamSubTab('questions');
      setShowAddQuestionForm(false);
      setShowEnrollStudentForm(false);
      setSelectedQuestionForSubmissions(null);
      setEditingQuestion(null);
      if (user?.role === 'TEACHER') {
        setActiveTab('exams');
      } else {
        setActiveTab('student-exams');
      }
    } catch (err) {
      alert('Không thể tải chi tiết kỳ thi');
    }
  };

  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !editExamTitle) return;
    try {
      await axios.put(`/exams/${selectedExam.id}`, { title: editExamTitle });
      alert('Đã cập nhật tên kỳ thi thành công');
      setIsEditingExam(false);
      const res = await axios.get(`/exams/${selectedExam.id}`);
      setSelectedExam(res.data);
      fetchExams();
    } catch (err) {
      alert('Không thể cập nhật tên kỳ thi');
    }
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;
    const ok = window.confirm('Bạn có chắc chắn muốn xóa kỳ thi này không? Toàn bộ câu hỏi, bài làm và kết quả chấm điểm liên quan sẽ bị xóa vĩnh viễn.');
    if (!ok) return;
    try {
      await axios.delete(`/exams/${selectedExam.id}`);
      alert('Đã xóa kỳ thi thành công');
      setSelectedExam(null);
      fetchExams();
      setActiveTab('home');
    } catch (err) {
      alert('Không thể xóa kỳ thi');
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !enrollStudentEmail) return;
    try {
      await axios.post(`/exams/${selectedExam.id}/students`, {
        email: enrollStudentEmail
      });
      alert('Đã thêm học sinh vào kỳ thi');
      handleSelectExam(selectedExam.id);
      setEnrollStudentEmail('');
    } catch (err) {
      alert('Lỗi thêm học sinh. Hãy kiểm tra xem email học sinh có chính xác không.');
    }
  };

  const handleAddRubricStep = () => {
    setRubricSteps([
      ...rubricSteps,
      { stepIndex: rubricSteps.length + 1, latexContent: '', maxScore: 0.25 }
    ]);
  };

  const handleRemoveRubricStep = (index: number) => {
    const updated = rubricSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      stepIndex: i + 1
    }));
    setRubricSteps(updated);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !newQuestionContent) return;
    try {
      await axios.post('/questions', {
        examId: selectedExam.id,
        name: newQuestionName || 'Câu hỏi',
        content: newQuestionContent,
        rubricSteps: rubricSteps
      });
      setNewQuestionName('');
      setNewQuestionContent('');
      setRubricSteps([{ stepIndex: 1, latexContent: '', maxScore: 0.25 }]);
      alert('Đã tạo câu hỏi và barem chấm thành công');
      await handleSelectExam(selectedExam.id);
      setActiveTab('exams');
    } catch (err) {
      alert('Không thể tạo câu hỏi');
    }
  };

  const handleLoadSubmissions = async (questionId: string) => {
    const q = selectedExam?.questions?.find((x: any) => x.id === questionId);
    setSelectedQuestionForSubmissions(q);
    try {
      const res = await axios.get(`/submissions/question/${questionId}`);
      setSubmissions(res.data);
      setTimeout(() => {
        document.getElementById('submissions-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      alert('Không thể tải danh sách bài nộp');
    }
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !selectedExam) return;
    try {
      await axios.put(`/questions/${editingQuestion.id}`, {
        examId: selectedExam.id,
        name: editingQuestion.name || 'Câu hỏi',
        content: editingQuestion.content,
        rubricSteps: editingQuestion.rubricSteps
      });
      alert('Đã cập nhật câu hỏi thành công');
      setEditingQuestion(null);
      await handleSelectExam(selectedExam.id);
      setActiveTab('exams');
    } catch (err) {
      alert('Không thể cập nhật câu hỏi. Vui lòng thử lại.');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const ok = window.confirm('Bạn có chắc chắn muốn xóa câu hỏi này? Toàn bộ barem, bài làm học sinh và điểm số liên quan sẽ bị xóa vĩnh viễn.');
    if (!ok) return;
    try {
      await axios.delete(`/questions/${questionId}`);
      alert('Đã xóa câu hỏi thành công');
      if (selectedQuestionForSubmissions && selectedQuestionForSubmissions.id === questionId) {
        setSelectedQuestionForSubmissions(null);
        setSubmissions([]);
      }
      handleSelectExam(selectedExam.id);
    } catch (err) {
      alert('Không thể xóa câu hỏi. Vui lòng thử lại.');
    }
  };

  const handleSelectSubmissionForGrading = async (sub: any) => {
    try {
      const res = await axios.get(`/evaluations/submission/${sub.id}`);
      const evalData = res.data;
      setSelectedSubmission({ ...sub, evaluation: evalData });

      if (evalData) {
        setOverrideTotalScore(evalData.totalScore);
        setOverrideSteps(
          evalData.stepEvaluations.map((step: any) => ({
            stepEvaluationId: step.id,
            isMarkedIncorrect: step.isMarkedIncorrect,
            teacherFeedback: step.teacherFeedback || ''
          }))
        );
      } else {
        setOverrideTotalScore(0);
        setOverrideSteps([]);
      }
      setActiveTab('grading');
    } catch (err) {
      // If no evaluation exists yet, we can still load submission metadata
      setSelectedSubmission({ ...sub, evaluation: null });
      setOverrideTotalScore(0);
      setOverrideSteps([]);
      setActiveTab('grading');
    }
  };

  const handleTriggerAiGrading = async (submissionId: string) => {
    try {
      await axios.post('/submissions/trigger-grading', { submissionIds: [submissionId] });
      alert('Đã kích hoạt AI chấm bài. Vui lòng chờ 5 giây rồi tải lại trang.');

      // Auto refresh submission details after 5s
      setTimeout(async () => {
        if (selectedSubmission && selectedSubmission.id === submissionId) {
          handleSelectSubmissionForGrading(selectedSubmission);
        }
      }, 5000);
    } catch (err) {
      alert('Lỗi kích hoạt chấm điểm');
    }
  };

  const handleSaveOverride = async () => {
    if (!selectedSubmission?.evaluation) return;
    try {
      await axios.put(`/evaluations/${selectedSubmission.evaluation.id}/override`, {
        totalScore: overrideTotalScore,
        steps: overrideSteps
      });
      alert('Ghi đè kết quả thành công');
      handleSelectSubmissionForGrading(selectedSubmission);
    } catch (err) {
      alert('Lỗi ghi đè kết quả');
    }
  };

  const handlePublishEvaluation = async (submissionId: string) => {
    try {
      await axios.post(`/evaluations/submission/${submissionId}/publish`);
      alert('Đã công bố điểm số tới học sinh');
      handleSelectSubmissionForGrading(selectedSubmission);
    } catch (err) {
      alert('Không thể công bố kết quả. Kiểm tra xem đã chấm điểm chưa.');
    }
  };

  // Student Actions
  const handleStudentUpload = async (questionId: string) => {
    if (!selectedFile) {
      alert('Vui lòng chọn một file ảnh');
      return;
    }
    setUploadProgress('Đang chuẩn bị upload...');
    try {
      // 1. Get Presigned S3 URL from Backend
      const res = await axios.post('/submissions/presigned-url', {
        questionId,
        contentType: selectedFile.type
      });

      const { presignedUrl, imageUrl } = res.data;
      setUploadProgress('Đang tải ảnh lên S3...');

      // 2. Upload file directly to S3/MinIO using native fetch (prevents JWT auth header leak)
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload to S3: ${uploadResponse.statusText}`);
      }

      setUploadProgress('Đang xác nhận bài làm...');

      // 3. Confirm submission in backend
      await axios.post('/submissions', {
        questionId,
        imageUrl
      });

      setUploadProgress('Nộp bài thành công!');
      setSelectedFile(null);
      handleSelectExam(selectedExam.id);
    } catch (err) {
      console.error(err);
      setUploadProgress('Lỗi trong quá trình nộp bài');
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn gỡ bài làm này? Hành động này sẽ xóa file ảnh và toàn bộ kết quả chấm điểm của câu hỏi này.')) {
      return;
    }
    try {
      await axios.delete(`/submissions/${submissionId}`);
      alert('Đã gỡ bài làm thành công!');
      if (selectedExam) {
        handleSelectExam(selectedExam.id);
      }
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi gỡ bài làm.');
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-text">MAGR</div>
          <button className="btn-icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="sidebar-menu">
          <div className="menu-group-label">TỔNG QUAN</div>
          <div className={`menu-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <Home size={18} />
            <span className="menu-item-text">Trang chủ</span>
          </div>

          <div className="menu-group-label">KỲ THI</div>
          {user?.role === 'TEACHER' ? (
            <div className={`menu-item ${activeTab === 'exams' ? 'active' : ''}`} onClick={() => setActiveTab('exams')}>
              <BookOpen size={18} />
              <span className="menu-item-text">Quản lý kỳ thi</span>
            </div>
          ) : (
            <div className={`menu-item ${activeTab === 'student-exams' ? 'active' : ''}`} onClick={() => setActiveTab('student-exams')}>
              <BookOpen size={18} />
              <span className="menu-item-text">Kỳ thi của tôi</span>
            </div>
          )}

          {selectedSubmission && user?.role === 'TEACHER' && (
            <div className={`menu-item ${activeTab === 'grading' ? 'active' : ''}`} onClick={() => setActiveTab('grading')}>
              <FileCheck size={18} />
              <span className="menu-item-text">Chấm điểm bài làm</span>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="menu-item" onClick={logout} style={{ color: '#ef4444' }}>
            <LogOut size={18} />
            <span className="menu-item-text">Đăng xuất</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px' }}>
            {!sidebarCollapsed && "Phiên bản v1.1.0"}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        <div className="breadcrumb">
          <span>Hệ thống</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-active">
            {activeTab === 'home' && 'Trang chủ'}
            {activeTab === 'exams' && 'Quản lý kỳ thi'}
            {activeTab === 'student-exams' && 'Kỳ thi của tôi'}
            {activeTab === 'grading' && 'Chấm điểm bài làm'}
          </span>
        </div>

        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Xin chào, {user?.name}!</h1>
              <p className="page-subtitle">Hệ thống chấm điểm toán tự luận dựa trên barem điểm</p>
            </div>

            {user?.role === 'TEACHER' && (
              <div style={{ marginBottom: '24px' }}>
                <button className="btn btn-primary" onClick={() => { setActiveTab('create-exam'); setNewExamTitle(''); }}>
                  + Tạo kỳ thi mới
                </button>
              </div>
            )}

            <h3>Danh sách kỳ thi</h3>
            <div className="table-container" style={{ marginTop: '16px' }}>
              <table className="app-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Thông tin kỳ thi</th>
                    <th>Số câu hỏi</th>
                    <th>{user?.role === 'TEACHER' ? 'Số học sinh' : 'Số bài đã nộp'}</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((ex, index) => {
                    const submittedCount = ex.questions?.filter((q: any) => q.submissions?.length > 0 && q.submissions[0].status !== 'NOT_SUBMITTED').length || 0;
                    return (
                      <tr key={ex.id} onClick={() => handleSelectExam(ex.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: '60px' }}>{index + 1}</td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{ex.title}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>ID: {ex.id}</div>
                        </td>
                        <td>{ex.questions?.length || 0}</td>
                        <td>{user?.role === 'TEACHER' ? (ex.students?.length || 0) : `${submittedCount}/${ex.questions?.length || 0}`}</td>
                      </tr>
                    );
                  })}
                  {exams.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        Không có kỳ thi nào hoạt động.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TEACHER EXAM MANAGEMENT */}
        {activeTab === 'exams' && selectedExam && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {isEditingExam ? (
                  <form onSubmit={handleUpdateExam} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={editExamTitle}
                      onChange={(e) => setEditExamTitle(e.target.value)}
                      style={{ fontSize: '24px', fontWeight: 'bold', width: '300px' }}
                    />
                    <button type="submit" className="btn btn-primary">Lưu</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsEditingExam(false)}>Hủy</button>
                  </form>
                ) : (
                  <>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {selectedExam.title}
                      <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setIsEditingExam(true)}>
                        Sửa tên
                      </button>
                    </h1>
                    <p className="page-subtitle">ID Kỳ thi: {selectedExam.id}</p>
                  </>
                )}
              </div>
              <div>
                <button className="btn btn-primary" style={{ backgroundColor: '#ef4444' }} onClick={handleDeleteExam}>
                  Xóa kỳ thi
                </button>
              </div>
            </div>

            {/* Overview statistics card */}
            <div className="stat-card" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '32px' }}>
              <div>
                <div className="stat-label">Số câu hỏi đề thi</div>
                <div className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '28px' }}>
                  {selectedExam.questions?.length || 0}
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '32px' }}>
                <div className="stat-label">Số học sinh đã ghi danh</div>
                <div className="stat-value" style={{ color: 'var(--success-color)', fontSize: '28px' }}>
                  {selectedExam.students?.length || 0}
                </div>
              </div>
            </div>

            {/* Sub-tab selection menu bar */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', paddingBottom: '8px' }}>
              <button
                className={`btn ${examSubTab === 'questions' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', borderRadius: '20px' }}
                onClick={() => setExamSubTab('questions')}
              >
                Đề thi
              </button>
              <button
                className={`btn ${examSubTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', borderRadius: '20px' }}
                onClick={() => setExamSubTab('students')}
              >
                Danh sách học sinh
              </button>
            </div>

            {/* Sub-tab 1: QUESTIONS */}
            {examSubTab === 'questions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3>Danh sách các câu hỏi đã tạo</h3>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('view-rubrics')}>
                      Xem Barem
                    </button>
                    <button className="btn btn-primary" onClick={() => {
                      setActiveTab('create-question');
                      setNewQuestionName('Câu hỏi ' + ((selectedExam.questions?.length || 0) + 1));
                      setNewQuestionContent('');
                      setRubricSteps([{ stepIndex: 1, latexContent: '', maxScore: 0.25 }]);
                    }}>
                      + Thêm câu hỏi
                    </button>
                  </div>
                </div>

                {/* Questions Table */}
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Tên câu hỏi</th>
                        <th>Điểm số tối đa</th>
                        <th>Số bài nộp</th>
                        <th>Số bài đã chấm</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedExam.questions?.map((q: any, qIdx: number) => {
                        const maxScore = q.rubricSteps?.reduce((acc: number, step: any) => acc + step.maxScore, 0) || 0;
                        const submissionsCount = q.submissions?.length || 0;
                        const gradedCount = q.submissions?.filter((s: any) => s.status === 'GRADED').length || 0;

                        return (
                          <tr key={q.id} onClick={() => { setEditingQuestion(JSON.parse(JSON.stringify(q))); setActiveTab('edit-question'); }} style={{ cursor: 'pointer' }}>
                            <td style={{ width: '60px' }}>{qIdx + 1}</td>
                            <td style={{ fontWeight: '600' }}>{q.name || `Câu hỏi ${qIdx + 1}`}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{formatScore(maxScore)}đ</td>
                            <td>{submissionsCount}</td>
                            <td>{gradedCount}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={(e) => { e.stopPropagation(); handleLoadSubmissions(q.id); }}>
                                  Xem bài nộp
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#ef4444', color: 'white' }} onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}>
                                  Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(selectedExam.questions?.length === 0 || !selectedExam.questions) && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Chưa có câu hỏi nào trong đề thi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: STUDENTS */}
            {examSubTab === 'students' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3>Danh sách học sinh đã ghi danh</h3>
                  <button className="btn btn-primary" onClick={() => setShowEnrollStudentForm(!showEnrollStudentForm)}>
                    {showEnrollStudentForm ? 'Đóng form' : '+ Thêm học sinh'}
                  </button>
                </div>

                {/* Form to Enroll Student */}
                {showEnrollStudentForm && (
                  <div className="panel-card" style={{ maxWidth: '500px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px' }}>Thêm học sinh vào kỳ thi</h3>
                    <form onSubmit={handleEnrollStudent}>
                      <div className="form-group">
                        <label className="form-label">Email học sinh</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="studentA@gmail.com"
                          value={enrollStudentEmail}
                          onChange={(e) => setEnrollStudentEmail(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" className="btn btn-primary btn-full">
                        Thêm học sinh
                      </button>
                    </form>
                  </div>
                )}

                {/* Students Table */}
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Học sinh</th>
                        <th>Email</th>
                        <th>ID Học sinh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedExam.students?.map((s: any, sIdx: number) => (
                        <tr key={s.student.id}>
                          <td style={{ width: '60px' }}>{sIdx + 1}</td>
                          <td style={{ fontWeight: '600' }}>{s.student.name}</td>
                          <td>{s.student.email}</td>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.student.id}</td>
                        </tr>
                      ))}
                      {(selectedExam.students?.length === 0 || !selectedExam.students) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Chưa có học sinh nào được thêm vào kỳ thi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* List Submissions Section */}
            {selectedQuestionForSubmissions && (
              <div id="submissions-section" style={{ marginTop: '40px' }}>
                <h3>Danh sách bài nộp của học sinh (Câu hỏi #{selectedExam.questions?.findIndex((x: any) => x.id === selectedQuestionForSubmissions.id) + 1})</h3>
                {submissions.length === 0 ? (
                  <div style={{ padding: '24px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', marginTop: '16px' }}>
                    Chưa có học sinh nào nộp bài cho câu hỏi này.
                  </div>
                ) : (
                  <div className="table-container" style={{ marginTop: '16px' }}>
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th>Học sinh</th>
                          <th>Ảnh bài nộp</th>
                          <th>Trạng thái</th>
                          <th>OCR AI</th>
                          <th>Công bố</th>
                          <th>Điểm AI</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((sub) => (
                          <tr key={sub.id}>
                            <td style={{ fontWeight: '600' }}>{sub.student?.name}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              <a href={sub.imageUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--primary-color)' }}>
                                Xem ảnh S3
                              </a>
                            </td>
                            <td>
                              {sub.status === 'NOT_SUBMITTED' && <span className="badge badge-error">Chưa nộp</span>}
                              {sub.status === 'SUBMITTED' && <span className="badge badge-warning">Đang chờ chấm</span>}
                              {sub.status === 'GRADED' && <span className="badge badge-success">Đã chấm điểm</span>}
                            </td>
                            <td>
                              {sub.ocrStatus === 'PROCESSING' && <span className="badge badge-warning" style={{ backgroundColor: 'rgba(56,189,248,0.2)', color: '#38bdf8' }}>Đang OCR...</span>}
                              {sub.ocrStatus === 'COMPLETED' && <span className="badge badge-success" style={{ backgroundColor: 'rgba(52,211,153,0.2)', color: '#34d399' }}>Đã OCR</span>}
                              {sub.ocrStatus === 'FAILED' && <span className="badge badge-error">Lỗi OCR</span>}
                              {(!sub.ocrStatus || sub.ocrStatus === 'PENDING') && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Chờ OCR</span>}
                            </td>
                            <td>
                              {sub.isPublished ? (
                                <span style={{ color: 'var(--success-color)' }}>Đã công bố</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Chưa công bố</span>
                              )}
                            </td>
                            <td style={{ fontWeight: 'bold' }}>
                              {sub.evaluation ? `${formatScore(sub.evaluation.totalScore)}đ` : '---'}
                            </td>
                            <td>
                              <button className="btn btn-secondary" onClick={() => handleSelectSubmissionForGrading(sub)}>
                                Chấm điểm & Duyệt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STUDENT EXAM DETAIL & SUBMISSION */}
        {activeTab === 'student-exams' && selectedExam && (
          <div>
            <div className="page-header">
              <h1 className="page-title">{selectedExam.title}</h1>
              <p className="page-subtitle">ID Kỳ thi: {selectedExam.id}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {selectedExam.questions?.map((q: any, index: number) => {
                const sub = q.submissions?.[0]; // Current student's submission for this question
                return (
                  <div key={q.id} className="panel-card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                      <h3>{q.name || `Câu ${index + 1}`}</h3>
                      <div>
                        {sub?.status === 'GRADED' ? (
                          <span className="badge badge-success">Điểm: {formatScore(sub.evaluation?.totalScore || 0)}đ</span>
                        ) : sub?.status === 'SUBMITTED' ? (
                          <span className="badge badge-warning">Đã nộp bài (Chờ chấm)</span>
                        ) : (
                          <span className="badge badge-error">Chưa nộp</span>
                        )}
                      </div>
                    </div>

                    <div className="step-math" style={{ marginBottom: '24px' }}>
                      <MathRenderer math={q.content} />
                    </div>

                    {/* Submit Section */}
                    {(!sub || sub.status === 'NOT_SUBMITTED') ? (
                      <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                        <Upload size={32} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
                        <div style={{ marginBottom: '16px' }}>Tải ảnh bài làm tự luận của bạn lên (Định dạng PNG, JPG)</div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', alignItems: 'center' }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            style={{ display: 'none' }}
                            id={`file-upload-${q.id}`}
                          />
                          <label htmlFor={`file-upload-${q.id}`} className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                            Chọn ảnh bài làm
                          </label>
                          {selectedFile && <span style={{ fontSize: '13px' }}>{selectedFile.name}</span>}

                          <button className="btn btn-primary" onClick={() => handleStudentUpload(q.id)} disabled={!selectedFile}>
                            Tải lên & Nộp bài
                          </button>
                        </div>
                        {uploadProgress && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--primary-color)', fontWeight: 'bold' }}>{uploadProgress}</div>}
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <div className="form-label" style={{ marginBottom: '8px' }}>Bài làm đã nộp:</div>
                            {sub.submittedAt && (
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                Thời gian nộp: {new Date(sub.submittedAt).toLocaleString('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                              <a
                                href={sub.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontSize: '13px', padding: '6px 12px' }}
                              >
                                Xem bài làm (Tab mới)
                              </a>
                              <button
                                className="btn btn-secondary"
                                style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', fontSize: '13px', padding: '6px 12px' }}
                                onClick={() => handleDeleteSubmission(sub.id)}
                              >
                                Gỡ bài làm
                              </button>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                              <ImageViewerWithBbox
                                imageUrl={sub.imageUrl}
                                bboxes={sub.ocrBboxes}
                                ocrStatus={sub.ocrStatus}
                                ocrContent={sub.ocrContent}
                                altText="Bài làm của bạn"
                              />
                            </div>
                          </div>

                          {/* Graded Details display */}
                          {sub.isPublished && sub.evaluation && (
                            <div style={{ flex: 1.5 }}>
                              <h4 style={{ marginBottom: '12px' }}>Phân tích kết quả chấm điểm từng bước:</h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {sub.evaluation.stepEvaluations?.map((step: any, sIdx: number) => (
                                  <div key={step.id} className={`step-item ${step.isMarkedIncorrect ? 'incorrect' : 'correct'}`}>
                                    <div className="step-header">
                                      <span className="step-title">Bước {sIdx + 1}</span>
                                      <span className={`badge ${step.isMarkedIncorrect ? 'badge-error' : 'badge-success'}`}>
                                        {step.isMarkedIncorrect ? 'Sai sót logic' : 'Chính xác'}
                                      </span>
                                    </div>
                                    <div className="step-reasoning">
                                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>AI Nhận xét:</div>
                                      <div>{step.aiReasoning}</div>
                                      {step.teacherFeedback && (
                                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', color: 'var(--primary-color)' }}>
                                          <strong>Phản hồi từ Giáo viên:</strong> {step.teacherFeedback}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: TEACHER GRADING INTERFACE */}
        {activeTab === 'grading' && selectedSubmission && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Bài làm: {selectedSubmission.student?.name}</h1>
              <p className="page-subtitle">Chi tiết bài làm và giao diện điều chỉnh barem điểm AI</p>
            </div>

            <div className="grading-split">
              {/* Left Column: Image viewer with OCR BBox Overlay */}
              <div className="image-panel" style={{ height: 'auto', minHeight: 'unset', alignItems: 'stretch' }}>
                <ImageViewerWithBbox
                  imageUrl={selectedSubmission.imageUrl}
                  bboxes={selectedSubmission.ocrBboxes}
                  ocrStatus={selectedSubmission.ocrStatus}
                  ocrContent={selectedSubmission.ocrContent}
                  altText={`Bài làm của ${selectedSubmission.student?.name || 'học sinh'}`}
                />
              </div>

              {/* Right Column: AI grading output & feedback override inputs */}
              <div className="data-panel">
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3>Đánh giá qua AI</h3>
                    <button className="btn btn-primary" onClick={() => handleTriggerAiGrading(selectedSubmission.id)}>
                      Chạy AI Chấm bài
                    </button>
                  </div>

                  {!selectedSubmission.evaluation ? (
                    <div style={{ padding: '24px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <AlertTriangle size={32} style={{ marginBottom: '12px' }} />
                      <div>Bài làm này chưa được chạy chấm điểm. Vui lòng bấm nút 'Chạy AI Chấm bài' phía trên để kích hoạt chấm bài.</div>
                    </div>
                  ) : (
                    <div>
                      {/* Overall points */}
                      <div className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="stat-label">Tổng điểm đánh giá</div>
                          <div className="stat-value">{formatScore(overrideTotalScore)}đ</div>
                          {selectedSubmission.evaluation.isTeacherOverridden && (
                            <span style={{ fontSize: '11px', color: 'var(--primary-color)' }}>(Giáo viên đã sửa kết quả)</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                          <button className="btn btn-secondary" onClick={() => handlePublishEvaluation(selectedSubmission.id)} disabled={selectedSubmission.isPublished}>
                            {selectedSubmission.isPublished ? 'Đã công bố' : 'Công bố kết quả'}
                          </button>
                        </div>
                      </div>

                      {/* Steps details and inputs */}
                      <h4 style={{ marginBottom: '16px' }}>Barem điểm chi tiết từng bước</h4>

                      {selectedSubmission.evaluation.stepEvaluations?.map((step: any, idx: number) => {
                        const localOverride = overrideSteps[idx];
                        if (!localOverride) return null;

                        return (
                          <div key={step.id} className={`step-item ${localOverride.isMarkedIncorrect ? 'incorrect' : 'correct'}`} style={{ borderLeftWidth: '4px' }}>
                            <div className="step-header">
                              <span className="step-title">Bước {idx + 1}: <MathRenderer math={step.rubricStep?.latexContent || ''} /></span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={localOverride.isMarkedIncorrect}
                                    onChange={(e) => {
                                      const updated = [...overrideSteps];
                                      updated[idx].isMarkedIncorrect = e.target.checked;
                                      setOverrideSteps(updated);
                                    }}
                                  />
                                  Sai logic
                                </label>
                              </div>
                            </div>

                            <div className="step-math" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Barem max: +{formatScore(step.rubricStep?.maxScore || 0)}đ
                            </div>

                            <div className="step-reasoning" style={{ marginBottom: '12px' }}>
                              <strong>AI Reasoning:</strong> {step.aiReasoning}
                            </div>

                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: '12px' }}>Ý kiến giáo viên ghi đè (Teacher Feedback):</label>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Ghi nhận xét điều chỉnh tại đây..."
                                value={localOverride.teacherFeedback}
                                onChange={(e) => {
                                  const updated = [...overrideSteps];
                                  updated[idx].teacherFeedback = e.target.value;
                                  setOverrideSteps(updated);
                                }}
                                style={{ padding: '8px 12px', fontSize: '13px' }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Total score slider or input */}
                      <div className="form-group" style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                        <label className="form-label">Điều chỉnh tổng điểm giáo viên:</label>
                        <input
                          type="number"
                          step="0.05"
                          className="form-input"
                          value={overrideTotalScore}
                          onChange={(e) => setOverrideTotalScore(parseFloat(e.target.value) || 0)}
                          style={{ width: '120px' }}
                        />
                      </div>

                      <button className="btn btn-primary" onClick={handleSaveOverride} style={{ marginTop: '12px' }}>
                        Lưu kết quả ghi đè
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CREATE EXAM VIEW */}
        {activeTab === 'create-exam' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Tạo kỳ thi mới</h1>
              <p className="page-subtitle">Tạo một kỳ thi tự luận mới và thiết lập đề bài</p>
            </div>
            <div className="panel-card" style={{ maxWidth: '600px', margin: '0 auto', borderLeft: '4px solid var(--primary-color)' }}>
              <form onSubmit={handleCreateExam}>
                <div className="form-group">
                  <label className="form-label">Tên kỳ thi</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ví dụ: Giữa kỳ I - Đại số tuyến tính 2026"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    Tạo kỳ thi
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setActiveTab('home'); setNewExamTitle(''); }} style={{ flex: 1 }}>
                    Quay lại
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 6: CREATE QUESTION VIEW */}
        {activeTab === 'create-question' && selectedExam && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Thêm câu hỏi mới</h1>
              <p className="page-subtitle">Kỳ thi: {selectedExam.title}</p>
            </div>

            <div className="panel-card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
              <form onSubmit={handleCreateQuestion}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label">Tên câu hỏi</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newQuestionName}
                    onChange={(e) => setNewQuestionName(e.target.value)}
                    placeholder="Ví dụ: Câu 1"
                    required
                  />
                </div>

                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div>
                    <label className="form-label">Đề bài (Gõ mã LaTeX)</label>
                    <textarea
                      className="form-input"
                      rows={6}
                      placeholder="Ví dụ: Cho hàm mật độ xác suất của biến ngẫu nhiên $X$..."
                      value={newQuestionContent}
                      onChange={(e) => setNewQuestionContent(e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'monospace' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Xem trước đề bài (LaTeX Live Preview)</label>
                    <div style={{ padding: '16px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', minHeight: '150px', overflowY: 'auto' }}>
                      <MathRenderer math={newQuestionContent || 'Đề bài trống...'} />
                    </div>
                  </div>
                </div>

                {/* Rubric steps list */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="form-label">Barem điểm từng bước (Rubric)</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleAddRubricStep}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      + Thêm bước
                    </button>
                  </div>

                  {rubricSteps.map((step, idx) => (
                    <div key={idx} style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '16px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold' }}>Bước {step.stepIndex}</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Barem điểm:</label>
                            <input
                              type="number"
                              step="0.05"
                              className="form-input"
                              value={step.maxScore}
                              onChange={(e) => {
                                const updated = [...rubricSteps];
                                updated[idx].maxScore = parseFloat(e.target.value) || 0;
                                setRubricSteps(updated);
                              }}
                              style={{ width: '80px', padding: '4px 8px' }}
                              required
                            />
                            <span style={{ fontSize: '13px' }}>đ</span>
                          </div>
                          {rubricSteps.length > 1 && (
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => handleRemoveRubricStep(idx)}
                              style={{ color: '#ef4444' }}
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Mô tả barem bằng LaTeX"
                            value={step.latexContent}
                            onChange={(e) => {
                              const updated = [...rubricSteps];
                              updated[idx].latexContent = e.target.value;
                              setRubricSteps(updated);
                            }}
                            style={{ fontFamily: 'monospace' }}
                            required
                          />
                        </div>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', minHeight: '38px', overflowX: 'auto' }}>
                          <MathRenderer math={step.latexContent || 'Bước trống...'} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    Tạo câu hỏi & Barem điểm
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setActiveTab('exams'); }} style={{ flex: 1 }}>
                    Quay lại
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 7: EDIT QUESTION VIEW */}
        {activeTab === 'edit-question' && editingQuestion && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Chỉnh sửa câu hỏi</h1>
              <p className="page-subtitle">Kỳ thi: {selectedExam?.title}</p>
            </div>

            <div className="panel-card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
              <form onSubmit={handleUpdateQuestion}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label">Tên câu hỏi</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingQuestion.name}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, name: e.target.value })}
                    placeholder="Ví dụ: Câu 1"
                    required
                  />
                </div>

                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div>
                    <label className="form-label">Đề bài (Gõ mã LaTeX)</label>
                    <textarea
                      className="form-input"
                      rows={6}
                      placeholder="Ví dụ: Cho hàm mật độ xác suất của biến ngẫu nhiên $X$..."
                      value={editingQuestion.content}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, content: e.target.value })}
                      style={{ resize: 'vertical', fontFamily: 'monospace' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Xem trước đề bài (LaTeX Live Preview)</label>
                    <div style={{ padding: '16px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', minHeight: '150px', overflowY: 'auto' }}>
                      <MathRenderer math={editingQuestion.content || 'Đề bài trống...'} />
                    </div>
                  </div>
                </div>

                {/* Rubric steps list */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="form-label">Barem điểm từng bước (Rubric)</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const steps = editingQuestion.rubricSteps || [];
                        setEditingQuestion({
                          ...editingQuestion,
                          rubricSteps: [
                            ...steps,
                            { stepIndex: steps.length + 1, latexContent: '', maxScore: 0.25 }
                          ]
                        });
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      + Thêm bước
                    </button>
                  </div>

                  {editingQuestion.rubricSteps?.map((step: any, idx: number) => (
                    <div key={idx} style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '16px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold' }}>Bước {step.stepIndex}</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Barem điểm:</label>
                            <input
                              type="number"
                              step="0.05"
                              className="form-input"
                              value={step.maxScore}
                              onChange={(e) => {
                                const steps = [...editingQuestion.rubricSteps];
                                steps[idx].maxScore = parseFloat(e.target.value) || 0;
                                setEditingQuestion({ ...editingQuestion, rubricSteps: steps });
                              }}
                              style={{ width: '80px', padding: '4px 8px' }}
                              required
                            />
                            <span style={{ fontSize: '13px' }}>đ</span>
                          </div>
                          {editingQuestion.rubricSteps.length > 1 && (
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => {
                                const steps = editingQuestion.rubricSteps
                                  .filter((_: any, i: number) => i !== idx)
                                  .map((s: any, i: number) => ({ ...s, stepIndex: i + 1 }));
                                setEditingQuestion({ ...editingQuestion, rubricSteps: steps });
                              }}
                              style={{ color: '#ef4444' }}
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Mô tả barem bằng LaTeX"
                            value={step.latexContent}
                            onChange={(e) => {
                              const steps = [...editingQuestion.rubricSteps];
                              steps[idx].latexContent = e.target.value;
                              setEditingQuestion({ ...editingQuestion, rubricSteps: steps });
                            }}
                            style={{ fontFamily: 'monospace' }}
                            required
                          />
                        </div>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', minHeight: '38px', overflowX: 'auto' }}>
                          <MathRenderer math={step.latexContent || 'Bước trống...'} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    Lưu thay đổi câu hỏi & Barem
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setActiveTab('exams'); }} style={{ flex: 1 }}>
                    Quay lại
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 8: VIEW RUBRICS VIEW */}
        {activeTab === 'view-rubrics' && selectedExam && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 className="page-title">Tổng hợp Đề thi & Barem</h1>
                <p className="page-subtitle">Kỳ thi: {selectedExam.title}</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setActiveTab('exams')}>
                Quay lại
              </button>
            </div>

            {/* Purple highlight ribbon */}
            <div style={{
              backgroundColor: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.15)',
              padding: '12px 24px',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 'bold',
              color: '#c084fc',
              marginBottom: '24px',
              fontSize: '15px'
            }}>
              Số câu hỏi: {selectedExam.questions?.length || 0} | Tổng Điểm Toàn Đề: {formatScore(
                selectedExam.questions?.reduce((acc: number, q: any) => {
                  const qScore = q.rubricSteps?.reduce((sum: number, s: any) => sum + s.maxScore, 0) || 0;
                  return acc + qScore;
                }, 0) || 0
              )}đ
            </div>

            {/* Rubrics Grid Table */}
            <div className="table-container">
              <table className="app-table" style={{ borderCollapse: 'collapse', width: '100%', border: '1px solid var(--border-color)' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ width: '150px', border: '1px solid var(--border-color)', textAlign: 'center' }}>CÂU</th>
                    <th style={{ border: '1px solid var(--border-color)' }}>NỘI DUNG</th>
                    <th style={{ width: '120px', border: '1px solid var(--border-color)', textAlign: 'center' }}>ĐIỂM</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedExam.questions?.map((q: any, qIdx: number) => {
                    const qMaxScore = q.rubricSteps?.reduce((acc: number, s: any) => acc + s.maxScore, 0) || 0;
                    const steps = q.rubricSteps || [];

                    return (
                      <React.Fragment key={q.id}>
                        {/* Row for Question Header & Body */}
                        <tr style={{ backgroundColor: 'rgba(59, 130, 246, 0.03)' }}>
                          <td
                            rowSpan={steps.length + 1}
                            style={{
                              border: '1px solid var(--border-color)',
                              textAlign: 'center',
                              fontWeight: 'bold',
                              verticalAlign: 'middle',
                              backgroundColor: 'rgba(255,255,255,0.01)'
                            }}
                          >
                            <div style={{ fontSize: '15px' }}>{qIdx + 1}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              ({formatScore(qMaxScore)}đ)
                            </div>
                          </td>
                          <td style={{ border: '1px solid var(--border-color)', padding: '12px' }}>
                            <div style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px' }}>
                              Đề bài:
                            </div>
                            <div className="step-math" style={{ margin: 0, padding: 0, backgroundColor: 'transparent', border: 'none' }}>
                              <MathRenderer math={q.content} />
                            </div>
                          </td>
                          <td style={{ border: '1px solid var(--border-color)', textAlign: 'center' }}></td>
                        </tr>

                        {/* Rows for Rubric Steps */}
                        {steps.map((step: any) => (
                          <tr key={step.id}>
                            <td style={{ border: '1px solid var(--border-color)', padding: '12px', paddingLeft: '24px' }}>
                              <div className="step-math" style={{ margin: 0, padding: 0, backgroundColor: 'transparent', border: 'none' }}>
                                <MathRenderer math={step.latexContent} />
                              </div>
                            </td>
                            <td
                              style={{
                                border: '1px solid var(--border-color)',
                                textAlign: 'center',
                                fontWeight: 'bold',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              {formatScore(step.maxScore)}đ
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {(!selectedExam.questions || selectedExam.questions.length === 0) && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                        Kỳ thi này chưa có câu hỏi và barem nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Unified Register & Login view
const AuthView: React.FC = () => {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        // Register API call
        await axios.post('/auth/register', { email, password, name, role });
        alert('Đăng ký tài khoản thành công! Hãy đăng nhập.');
        setIsRegister(false);
      } else {
        // Login API call
        const res = await axios.post('/auth/login', { email, password });
        login(res.data.access_token, res.data.user);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">AI GRADIENT</h2>
        <p className="auth-subtitle">
          {isRegister ? 'Đăng ký tài khoản hệ thống tự luận' : 'Đăng nhập vào cổng chấm điểm tự động'}
        </p>

        {error && (
          <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-color)', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '20px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Tên hiển thị</label>
              <input
                type="text"
                className="form-input"
                placeholder="Nguyễn Văn A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mật khẩu</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Vai trò</label>
              <select
                className="form-input"
                value={role}
                onChange={(e) => setRole(e.target.value as 'TEACHER' | 'STUDENT')}
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="STUDENT">Học sinh (Student)</option>
                <option value="TEACHER">Giáo viên (Teacher)</option>
              </select>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '12px' }}>
            {isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {isRegister ? (
            <div>
              Đã có tài khoản?{' '}
              <span style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setIsRegister(false)}>
                Đăng nhập ngay
              </span>
            </div>
          ) : (
            <div>
              Chưa có tài khoản?{' '}
              <span style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setIsRegister(true)}>
                Đăng ký ngay
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div>Đang tải ứng dụng...</div>
      </div>
    );
  }

  return isAuthenticated ? <DashboardContent /> : <AuthView />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
