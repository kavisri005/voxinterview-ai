import React, { useState } from 'react';
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
  const [formData, setFormData] = useState<CandidateProfile>(profile);
  const [activeTab, setActiveTab] = useState<'general' | 'skills' | 'projects' | 'experience' | 'summary'>('general');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Skill input temp states
  const [newSkill, setNewSkill] = useState('');
  const [newLang, setNewLang] = useState('');
  const [newFramework, setNewFramework] = useState('');
  const [newTool, setNewTool] = useState('');

  if (!isOpen) return null;

  const handleTextChange = (field: keyof CandidateProfile, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTag = (
    field: 'technicalSkills' | 'programmingLanguages' | 'frameworks' | 'toolsDatabases',
    value: string,
    clearInput: () => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!formData[field].includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        [field]: [...prev[field], trimmed],
      }));
    }
    clearInput();
  };

  const handleRemoveTag = (
    field: 'technicalSkills' | 'programmingLanguages' | 'frameworks' | 'toolsDatabases',
    tagToRemove: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((t) => t !== tagToRemove),
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

  // Load preset
  const handleLoadPreset = (presetKey: string) => {
    if (PROFILE_PRESETS[presetKey]) {
      setFormData(PROFILE_PRESETS[presetKey].profile);
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
    if (formData.name) score += 15;
    if (formData.degree && formData.college) score += 15;
    if (formData.summary) score += 20;
    if (formData.technicalSkills.length > 0) score += 15;
    if (formData.projects.length > 0) score += 20;
    if (formData.experience.length > 0) score += 15;
    return Math.min(score, 100);
  };

  const completeness = calculateCompleteness();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0c1220] border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold tracking-tight text-white">Candidate Profile Dossier</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {completeness}% Complete
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ground truth memory for Gemini to answer personal & project questions without hallucination
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
            <Code2 className="w-4 h-4" /> Skills & Tech Stack
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
            <Briefcase className="w-4 h-4" /> Experience ({formData.experience.length})
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" /> Resume Summary & Notes
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* GENERAL & EDUCATION */}
          {activeTab === 'general' && (
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
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Degree & Major
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
                  College / University
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
                  Graduation Year / Class
                </label>
                <input
                  type="text"
                  value={formData.gradYear}
                  onChange={(e) => handleTextChange('gradYear', e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. 2023"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Certifications (Comma separated)
                </label>
                <input
                  type="text"
                  value={formData.certifications.join(', ')}
                  onChange={(e) =>
                    handleTextChange(
                      'certifications',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="AWS Solutions Architect, CKA, Meta Frontend"
                />
              </div>
            </div>
          )}

          {/* SKILLS & STACK */}
          {activeTab === 'skills' && (
            <div className="space-y-5">
              {/* Programming Languages */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Programming Languages
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.programmingLanguages.map((lang) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    >
                      {lang}
                      <button
                        onClick={() => handleRemoveTag('programmingLanguages', lang)}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
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
                    placeholder="Type language and press Enter (e.g. Python, TypeScript)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('programmingLanguages', newLang, () => setNewLang(''))}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Frameworks & Libraries */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Frameworks & Libraries
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.frameworks.map((fw) => (
                    <span
                      key={fw}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    >
                      {fw}
                      <button
                        onClick={() => handleRemoveTag('frameworks', fw)}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
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
                    placeholder="Type framework and press Enter (e.g. React, Next.js, FastAPI)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('frameworks', newFramework, () => setNewFramework(''))}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tools & Databases */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Databases, Cloud & DevOps Tools
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.toolsDatabases.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    >
                      {tool}
                      <button
                        onClick={() => handleRemoveTag('toolsDatabases', tool)}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
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
                    placeholder="Type tool/DB and press Enter (e.g. PostgreSQL, Redis, Docker, Kafka)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleAddTag('toolsDatabases', newTool, () => setNewTool(''))}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Technical Skills / Concepts */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Core Technical Concepts & Domain Strengths
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-8 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  {formData.technicalSkills.map((sk) => (
                    <span
                      key={sk}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    >
                      {sk}
                      <button
                        onClick={() => handleRemoveTag('technicalSkills', sk)}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
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
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition"
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
                  When the interviewer asks "Tell me about your project", Gemini draws directly from these!
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
                        value={proj.role}
                        onChange={(e) => handleUpdateProject(proj.id, 'role', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        placeholder="e.g. Lead Architect & Full-Stack Engineer"
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
                      placeholder="Sub-40ms latency across 5,000 active sessions, 35% memory reduction"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EXPERIENCE */}
          {activeTab === 'experience' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Full-time and internship experience used for behavioral and background questions.
                </p>
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
                      ROLE #{idx + 1}
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        placeholder="Software Engineer"
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
                        placeholder="e.g. 2023 – Present"
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
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SUMMARY & NOTES */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Resume Summary / 30-Second Elevator Pitch
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

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Other Interview Specific Notes / Talking Points
                </label>
                <textarea
                  rows={3}
                  value={formData.otherInfo}
                  onChange={(e) => handleTextChange('otherInfo', e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 text-xs leading-relaxed text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Willing to relocate; passionate about distributed caching; currently studying Go concurrency..."
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
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Saved!
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
