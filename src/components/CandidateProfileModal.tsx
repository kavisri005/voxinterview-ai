import React, { useState, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Save,
  RotateCcw,
  GraduationCap,
  Briefcase,
  Code2,
  FolderGit2,
  FileText,
  CheckCircle2,
  Upload,
  FileUp,
  AlertCircle,
  Loader2,
  Award,
  Check,
  Mail,
  Phone,
  Layers,
} from 'lucide-react';
import { CandidateProfile, ProjectEntry, ExperienceEntry } from '../types/interview';
import { DEFAULT_CANDIDATE_PROFILE, PROFILE_PRESETS } from '../data/defaultProfile';

interface CandidateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CandidateProfile;
  onSaveProfile: (profile: CandidateProfile) => void;
}

export const CandidateProfileModal: React.FC<CandidateProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
}) => {
  const [formData, setFormData] = useState<CandidateProfile>(() => ({
    name: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    targetRole: profile.targetRole || '',
    degree: profile.degree || '',
    college: profile.college || '',
    gradYear: profile.gradYear || '',
    summary: profile.summary || '',
    technicalSkills: profile.technicalSkills || [],
    programmingLanguages: profile.programmingLanguages || [],
    frameworks: profile.frameworks || [],
    testingAutomationSkills: profile.testingAutomationSkills || [],
    toolsDatabases: profile.toolsDatabases || [],
    projects: profile.projects || [],
    experience: profile.experience || [],
    internships: profile.internships || [],
    certifications: profile.certifications || [],
    achievements: profile.achievements || [],
    otherInfo: profile.otherInfo || '',
  }));

  const [activeTab, setActiveTab] = useState<'general' | 'skills' | 'projects' | 'experience' | 'summary'>('general');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Resume upload & extraction states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzedSuccess, setAnalyzedSuccess] = useState<boolean>(false);
  const [analyzedFileName, setAnalyzedFileName] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Skill tag temp input states
  const [newSkill, setNewSkill] = useState('');
  const [newLang, setNewLang] = useState('');
  const [newFramework, setNewFramework] = useState('');
  const [newTestingSkill, setNewTestingSkill] = useState('');
  const [newTool, setNewTool] = useState('');
  const [newCert, setNewCert] = useState('');
  const [newAchievement, setNewAchievement] = useState('');

  if (!isOpen) return null;

  const handleTextChange = (field: keyof CandidateProfile, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  type TagField =
    | 'technicalSkills'
    | 'programmingLanguages'
    | 'frameworks'
    | 'testingAutomationSkills'
    | 'toolsDatabases'
    | 'certifications'
    | 'achievements';

  const handleAddTag = (field: TagField, value: string, clearInput: () => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const currentList = (formData[field] as string[]) || [];
    if (!currentList.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        [field]: [...((prev[field] as string[]) || []), trimmed],
      }));
    }
    clearInput();
  };

  const handleRemoveTag = (field: TagField, tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: ((prev[field] as string[]) || []).filter((t) => t !== tagToRemove),
    }));
  };

  // Projects handlers
  const handleAddProject = () => {
    const newProj: ProjectEntry = {
      id: `proj-${Date.now()}`,
      title: 'New Project Title',
      role: 'Full-Stack Developer',
      techStack: 'React, Node.js, TypeScript',
      description: 'Describe what the system does, architectural choices, and problems solved.',
      highlights: 'Reduced latency by 30%, handled 10,000 daily active users.',
    };
    setFormData((prev) => ({
      ...prev,
      projects: [newProj, ...prev.projects],
    }));
  };

  const handleUpdateProject = (id: string, field: keyof ProjectEntry, val: string) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, [field]: val } : p)),
    }));
  };

  const handleDeleteProject = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
  };

  // Experience handlers
  const handleAddExperience = () => {
    const newExp: ExperienceEntry = {
      id: `exp-${Date.now()}`,
      role: 'Software Engineer',
      company: 'Tech Company',
      period: '2023 – Present',
      description: 'Key responsibilities, team impact, and technologies used.',
    };
    setFormData((prev) => ({
      ...prev,
      experience: [newExp, ...prev.experience],
    }));
  };

  const handleUpdateExperience = (id: string, field: keyof ExperienceEntry, val: string) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    }));
  };

  const handleDeleteExperience = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.filter((e) => e.id !== id),
    }));
  };

  // Internships handlers
  const handleAddInternship = () => {
    const newInt: ExperienceEntry = {
      id: `int-${Date.now()}`,
      role: 'Engineering Intern',
      company: 'Company Name',
      period: 'Summer 2022',
      description: 'Contributions, automated tests built, and tools learned.',
    };
    setFormData((prev) => ({
      ...prev,
      internships: [newInt, ...(prev.internships || [])],
    }));
  };

  const handleUpdateInternship = (id: string, field: keyof ExperienceEntry, val: string) => {
    setFormData((prev) => ({
      ...prev,
      internships: (prev.internships || []).map((i) => (i.id === id ? { ...i, [field]: val } : i)),
    }));
  };

  const handleDeleteInternship = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      internships: (prev.internships || []).filter((i) => i.id !== id),
    }));
  };

  // Resume File Upload & Extraction Handler
  const handleProcessFile = async (file: File) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isValid =
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      file.type === 'application/pdf' ||
      file.type.includes('word');

    if (!isValid) {
      setUploadError('Please upload a PDF (.pdf) or Word document (.docx).');
      return;
    }

    setUploadError(null);
    setIsAnalyzing(true);
    setAnalyzedSuccess(false);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const commaIdx = res.indexOf(',');
          resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/extract-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.profile) {
        throw new Error(data.error || 'Failed to extract resume profile');
      }

      const ext: CandidateProfile = data.profile;

      // Populate formData with extracted fields while preserving any manually entered non-empty fields if extracted is empty
      setFormData((prev) => ({
        name: ext.name || prev.name || '',
        email: ext.email || prev.email || '',
        phone: ext.phone || prev.phone || '',
        targetRole: ext.targetRole || prev.targetRole || '',
        degree: ext.degree || prev.degree || '',
        college: ext.college || prev.college || '',
        gradYear: ext.gradYear || prev.gradYear || '',
        summary: ext.summary || prev.summary || '',
        technicalSkills: ext.technicalSkills && ext.technicalSkills.length > 0 ? ext.technicalSkills : prev.technicalSkills || [],
        programmingLanguages: ext.programmingLanguages && ext.programmingLanguages.length > 0 ? ext.programmingLanguages : prev.programmingLanguages || [],
        frameworks: ext.frameworks && ext.frameworks.length > 0 ? ext.frameworks : prev.frameworks || [],
        testingAutomationSkills: ext.testingAutomationSkills && ext.testingAutomationSkills.length > 0 ? ext.testingAutomationSkills : prev.testingAutomationSkills || [],
        toolsDatabases: ext.toolsDatabases && ext.toolsDatabases.length > 0 ? ext.toolsDatabases : prev.toolsDatabases || [],
        projects: ext.projects && ext.projects.length > 0 ? ext.projects : prev.projects || [],
        experience: ext.experience && ext.experience.length > 0 ? ext.experience : prev.experience || [],
        internships: ext.internships && ext.internships.length > 0 ? ext.internships : prev.internships || [],
        certifications: ext.certifications && ext.certifications.length > 0 ? ext.certifications : prev.certifications || [],
        achievements: ext.achievements && ext.achievements.length > 0 ? ext.achievements : prev.achievements || [],
        otherInfo: ext.otherInfo || prev.otherInfo || '',
      }));

      setAnalyzedFileName(file.name);
      setAnalyzedSuccess(true);
    } catch (err: any) {
      console.error('Error analyzing resume:', err);
      setUploadError(err.message || 'Unable to parse resume. Please check network or file format.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  // Load preset
  const handleLoadPreset = (presetKey: string) => {
    if (PROFILE_PRESETS[presetKey]) {
      setFormData(PROFILE_PRESETS[presetKey].profile);
      setAnalyzedSuccess(false);
    }
  };

  const handleSave = () => {
    onSaveProfile(formData);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  // Completeness score
  const calculateCompleteness = () => {
    let score = 0;
    if (formData.name) score += 10;
    if (formData.email || formData.phone) score += 10;
    if (formData.degree || formData.college) score += 15;
    if (formData.summary) score += 15;
    if (
      (formData.technicalSkills?.length || 0) +
      (formData.programmingLanguages?.length || 0) +
      (formData.frameworks?.length || 0) +
      (formData.testingAutomationSkills?.length || 0) >
      0
    ) {
      score += 20;
    }
    if ((formData.projects?.length || 0) > 0) score += 15;
    if ((formData.experience?.length || 0) + (formData.internships?.length || 0) > 0) score += 15;
    return Math.min(score, 100);
  };

  const completeness = calculateCompleteness();
  const totalSkillsCount =
    (formData.technicalSkills?.length || 0) +
    (formData.programmingLanguages?.length || 0) +
    (formData.frameworks?.length || 0) +
    (formData.testingAutomationSkills?.length || 0) +
    (formData.toolsDatabases?.length || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#0c1220] border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold tracking-tight text-white">Candidate Profile & Resume</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {completeness}% Complete
                </span>
                {analyzedSuccess && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <Check className="w-3.5 h-3.5" /> Resume analyzed ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Upload your resume (PDF/DOCX) or edit details below to ground Gemini's personalized interview answers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick preset selector */}
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Presets:
              </span>
              <button
                onClick={() => handleLoadPreset('fullstack')}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Full-Stack
              </button>
              <button
                onClick={() => handleLoadPreset('ai_engineer')}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                AI / ML
              </button>
              <button
                onClick={() => handleLoadPreset('frontend')}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Frontend
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* RESUME UPLOAD ZONE */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-[#0e1629] to-slate-950 border-b border-slate-800">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleProcessFile(e.target.files[0]);
              }
            }}
            accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
          />

          {isAnalyzing ? (
            <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Extracting Candidate Profile with AI...</h4>
                  <p className="text-xs text-indigo-200/80">
                    Identifying skills, testing tools, work experience, education, and projects from resume...
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
                Parsing Document
              </span>
            </div>
          ) : analyzedSuccess ? (
            <div className="p-3.5 sm:p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-300">Resume analyzed ✓</span>
                    <span className="text-xs font-mono text-slate-400">({analyzedFileName})</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Extracted <span className="font-semibold text-white">{totalSkillsCount} skills</span>,{' '}
                    <span className="font-semibold text-white">{formData.projects.length} projects</span>, and{' '}
                    <span className="font-semibold text-white">{formData.experience.length + (formData.internships?.length || 0)} roles</span>. All fields are populated and fully editable.
                  </p>
                </div>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
              >
                Upload Another Resume
              </button>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed transition cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-500/15'
                  : 'border-slate-700 hover:border-indigo-500/60 bg-slate-900/60 hover:bg-slate-900/90'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Upload Resume (PDF or DOCX)</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">
                      Auto-Extract
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drag and drop your resume file here or <span className="text-indigo-400 underline font-medium">browse</span>. Automatically identifies technical skills, experience, and projects.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition shrink-0">
                  Select Resume
                </span>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="mt-2.5 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-800/80 px-6 bg-slate-950/40 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-4 h-4" /> Personal & Education
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'skills'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" /> Skills & Tags ({totalSkillsCount})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'projects'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderGit2 className="w-4 h-4" /> Projects ({formData.projects.length})
          </button>
          <button
            onClick={() => setActiveTab('experience')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'experience'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" /> Experience ({formData.experience.length + (formData.internships?.length || 0)})
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" /> Summary & Certs
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* GENERAL & EDUCATION */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleTextChange('name', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Alex Rivera"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Target Role / Interview Position
                  </label>
                  <input
                    type="text"
                    value={formData.targetRole}
                    onChange={(e) => handleTextChange('targetRole', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Senior QA Automation Engineer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" /> Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleTextChange('email', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. alex.rivera@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-indigo-400" /> Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => handleTextChange('phone', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. +1 (555) 234-5678"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Degree / Education
                  </label>
                  <input
                    type="text"
                    value={formData.degree}
                    onChange={(e) => handleTextChange('degree', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. B.S. in Computer Science"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    University / College
                  </label>
                  <input
                    type="text"
                    value={formData.college}
                    onChange={(e) => handleTextChange('college', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. University of Washington"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Graduation Year
                  </label>
                  <input
                    type="text"
                    value={formData.gradYear}
                    onChange={(e) => handleTextChange('gradYear', e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. 2023"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SKILLS & CHIPS */}
          {activeTab === 'skills' && (
            <div className="space-y-6">
              {/* Testing & Automation Skills (User Example Requirement) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Testing & Automation Skills
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.testingAutomationSkills?.length || 0} skills
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/70 border border-emerald-500/30">
                  {(formData.testingAutomationSkills || []).map((sk) => (
                    <span
                      key={sk}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    >
                      {sk}
                      <button
                        onClick={() => handleRemoveTag('testingAutomationSkills', sk)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {(!formData.testingAutomationSkills || formData.testingAutomationSkills.length === 0) && (
                    <span className="text-xs text-slate-500 italic py-0.5">No automation testing skills added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTestingSkill}
                    onChange={(e) => setNewTestingSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('testingAutomationSkills', newTestingSkill, () => setNewTestingSkill(''));
                      }
                    }}
                    placeholder="Type automation skill and press Enter (e.g. Selenium, Cypress, Playwright, JUnit)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleAddTag('testingAutomationSkills', newTestingSkill, () => setNewTestingSkill(''))}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-lg text-white transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Programming Languages */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Programming Languages
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.programmingLanguages.length} languages
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.programmingLanguages.map((lang) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    >
                      {lang}
                      <button
                        onClick={() => handleRemoveTag('programmingLanguages', lang)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.programmingLanguages.length === 0 && (
                    <span className="text-xs text-slate-500 italic py-0.5">No languages added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLang}
                    onChange={(e) => setNewLang(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('programmingLanguages', newLang, () => setNewLang(''));
                      }
                    }}
                    placeholder="Type language and press Enter (e.g. Java, Python, TypeScript, C++)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('programmingLanguages', newLang, () => setNewLang(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Frameworks & Libraries */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Frameworks & Libraries
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.frameworks.length} frameworks
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.frameworks.map((fw) => (
                    <span
                      key={fw}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    >
                      {fw}
                      <button
                        onClick={() => handleRemoveTag('frameworks', fw)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.frameworks.length === 0 && (
                    <span className="text-xs text-slate-500 italic py-0.5">No frameworks added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFramework}
                    onChange={(e) => setNewFramework(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('frameworks', newFramework, () => setNewFramework(''));
                      }
                    }}
                    placeholder="Type framework and press Enter (e.g. React, Spring Boot, Node.js, Express)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('frameworks', newFramework, () => setNewFramework(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tools & Databases */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Databases, Cloud & DevOps Tools
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.toolsDatabases.length} tools
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.toolsDatabases.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    >
                      {tool}
                      <button
                        onClick={() => handleRemoveTag('toolsDatabases', tool)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.toolsDatabases.length === 0 && (
                    <span className="text-xs text-slate-500 italic py-0.5">No tools added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTool}
                    onChange={(e) => setNewTool(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('toolsDatabases', newTool, () => setNewTool(''));
                      }
                    }}
                    placeholder="Type tool/DB and press Enter (e.g. PostgreSQL, Redis, Docker, Git, Jira)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('toolsDatabases', newTool, () => setNewTool(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Technical & Architecture Concepts */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Core Technical & Architecture Concepts
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.technicalSkills.length} concepts
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.technicalSkills.map((sk) => (
                    <span
                      key={sk}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    >
                      {sk}
                      <button
                        onClick={() => handleRemoveTag('technicalSkills', sk)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.technicalSkills.length === 0 && (
                    <span className="text-xs text-slate-500 italic py-0.5">No technical concepts added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('technicalSkills', newSkill, () => setNewSkill(''));
                      }
                    }}
                    placeholder="Type concept and press Enter (e.g. System Design, WebSockets, Concurrency)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('technicalSkills', newSkill, () => setNewSkill(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  When the interviewer asks project questions, Gemini grounds the response directly in these details.
                </p>
                <button
                  onClick={handleAddProject}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Project
                </button>
              </div>

              {formData.projects.map((proj, idx) => (
                <div
                  key={proj.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-indigo-400 font-semibold">
                      PROJECT #{idx + 1}
                    </span>
                    <button
                      onClick={() => handleDeleteProject(proj.id)}
                      className="text-slate-500 hover:text-red-400 transition p-1"
                      title="Delete project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Project Name
                      </label>
                      <input
                        type="text"
                        value={proj.title}
                        onChange={(e) => handleUpdateProject(proj.id, 'title', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Your Role
                      </label>
                      <input
                        type="text"
                        value={proj.role || ''}
                        onChange={(e) => handleUpdateProject(proj.id, 'role', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        placeholder="e.g. Lead QA Engineer, Full-Stack Developer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Tech Stack Used
                    </label>
                    <input
                      type="text"
                      value={proj.techStack}
                      onChange={(e) => handleUpdateProject(proj.id, 'techStack', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-sky-300 font-mono focus:outline-none focus:border-indigo-500"
                      placeholder="React, TypeScript, Node.js, WebSockets, Redis"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Architecture & What It Does
                    </label>
                    <textarea
                      rows={2}
                      value={proj.description}
                      onChange={(e) => handleUpdateProject(proj.id, 'description', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Key Highlights / Measurable Metrics
                    </label>
                    <input
                      type="text"
                      value={proj.highlights || ''}
                      onChange={(e) => handleUpdateProject(proj.id, 'highlights', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                      placeholder="e.g. Executed 500+ automated test cases in CI pipeline with 99.8% pass rate"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EXPERIENCE & INTERNSHIPS */}
          {activeTab === 'experience' && (
            <div className="space-y-6">
              {/* Work Experience */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Work Experience
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Roles and responsibilities used for behavioral and background questions.
                    </p>
                  </div>
                  <button
                    onClick={handleAddExperience}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Experience
                  </button>
                </div>

                {formData.experience.map((exp, idx) => (
                  <div
                    key={exp.id}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-sky-400 font-semibold">
                        WORK EXPERIENCE #{idx + 1}
                      </span>
                      <button
                        onClick={() => handleDeleteExperience(exp.id)}
                        className="text-slate-500 hover:text-red-400 transition p-1"
                        title="Delete experience"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Role Title
                        </label>
                        <input
                          type="text"
                          value={exp.role}
                          onChange={(e) => handleUpdateExperience(exp.id, 'role', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                          placeholder="QA Automation Engineer"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => handleUpdateExperience(exp.id, 'company', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="e.g. Acme Corp"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Duration / Period
                        </label>
                        <input
                          type="text"
                          value={exp.period}
                          onChange={(e) => handleUpdateExperience(exp.id, 'period', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="e.g. 2022 – Present (2 years)"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Responsibilities & Impact
                      </label>
                      <textarea
                        rows={2}
                        value={exp.description}
                        onChange={(e) => handleUpdateExperience(exp.id, 'description', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        placeholder="Key responsibilities, tools used, and measurable outcomes..."
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Internships */}
              <div className="space-y-4 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Internships
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Internship experiences from your resume.
                    </p>
                  </div>
                  <button
                    onClick={handleAddInternship}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Internship
                  </button>
                </div>

                {(formData.internships || []).map((intern, idx) => (
                  <div
                    key={intern.id}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-amber-400 font-semibold">
                        INTERNSHIP #{idx + 1}
                      </span>
                      <button
                        onClick={() => handleDeleteInternship(intern.id)}
                        className="text-slate-500 hover:text-red-400 transition p-1"
                        title="Delete internship"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Role Title
                        </label>
                        <input
                          type="text"
                          value={intern.role}
                          onChange={(e) => handleUpdateInternship(intern.id, 'role', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="QA Intern"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={intern.company}
                          onChange={(e) => handleUpdateInternship(intern.id, 'company', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="e.g. Beta Labs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Duration / Period
                        </label>
                        <input
                          type="text"
                          value={intern.period}
                          onChange={(e) => handleUpdateInternship(intern.id, 'period', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="Summer 2021"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Responsibilities & Impact
                      </label>
                      <textarea
                        rows={2}
                        value={intern.description}
                        onChange={(e) => handleUpdateInternship(intern.id, 'description', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        placeholder="Details about internship work..."
                      />
                    </div>
                  </div>
                ))}

                {(!formData.internships || formData.internships.length === 0) && (
                  <p className="text-xs text-slate-500 italic">No internships listed.</p>
                )}
              </div>
            </div>
          )}

          {/* SUMMARY, CERTS & ACHIEVEMENTS */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Professional Summary / 30-Second Elevator Pitch
                </label>
                <textarea
                  rows={4}
                  value={formData.summary}
                  onChange={(e) => handleTextChange('summary', e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 text-xs leading-relaxed text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Summarize your professional background, main focus, and core differentiator..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used directly when the interviewer says: "Walk me through your background" or "Tell me about yourself".
                </p>
              </div>

              {/* Certifications (Tags) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-400" /> Certifications
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.certifications.length} certs
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.certifications.map((cert) => (
                    <span
                      key={cert}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    >
                      {cert}
                      <button
                        onClick={() => handleRemoveTag('certifications', cert)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.certifications.length === 0 && (
                    <span className="text-xs text-slate-500 italic py-0.5">No certifications added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCert}
                    onChange={(e) => setNewCert(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('certifications', newCert, () => setNewCert(''));
                      }
                    }}
                    placeholder="Type certification and press Enter (e.g. ISTQB Certified Tester, AWS Solutions Architect)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('certifications', newCert, () => setNewCert(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Achievements (Tags) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" /> Key Achievements & Awards
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {formData.achievements?.length || 0} achievements
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  {(formData.achievements || []).map((ach) => (
                    <span
                      key={ach}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    >
                      {ach}
                      <button
                        onClick={() => handleRemoveTag('achievements', ach)}
                        className="hover:text-red-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {(!formData.achievements || formData.achievements.length === 0) && (
                    <span className="text-xs text-slate-500 italic py-0.5">No achievements added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAchievement}
                    onChange={(e) => setNewAchievement(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag('achievements', newAchievement, () => setNewAchievement(''));
                      }
                    }}
                    placeholder="Type achievement and press Enter (e.g. Employee of the Quarter, 1st Place Hackathon)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('achievements', newAchievement, () => setNewAchievement(''))}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Other Interview Talking Points / Context
                </label>
                <textarea
                  rows={2}
                  value={formData.otherInfo}
                  onChange={(e) => handleTextChange('otherInfo', e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 text-xs leading-relaxed text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Willing to relocate; passionate about automated testing; studying distributed systems..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/80">
          <button
            onClick={() => setFormData(DEFAULT_CANDIDATE_PROFILE)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2 py-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition active:scale-95"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Saved for Interview!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Profile
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
