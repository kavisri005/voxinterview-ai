import { CandidateProfile } from '../types/interview';

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = {
  name: 'Alex Rivera',
  email: 'alex.rivera@example.com',
  phone: '+1 (555) 234-5678',
  targetRole: 'Senior Full-Stack Engineer',
  degree: 'B.S. in Computer Science',
  college: 'University of Washington',
  gradYear: '2023',
  summary:
    'Full-stack engineer with 3+ years of experience building high-scale web applications, distributed systems, and real-time collaborative interfaces using TypeScript, React, Node.js, and PostgreSQL.',
  technicalSkills: [
    'System Architecture',
    'REST & GraphQL APIs',
    'Real-Time WebSockets',
    'Performance Optimization',
    'State Management',
    'CI/CD Pipelines',
  ],
  programmingLanguages: ['TypeScript', 'JavaScript', 'Python', 'Go', 'SQL'],
  frameworks: ['React', 'Next.js', 'Node.js', 'Express', 'TailwindCSS', 'FastAPI'],
  testingAutomationSkills: ['Jest', 'Cypress', 'Playwright', 'Automation Testing'],
  toolsDatabases: ['PostgreSQL', 'Redis', 'Docker', 'AWS (S3, Lambda)', 'Git', 'Kafka'],
  projects: [
    {
      id: 'proj-1',
      title: 'SyncFlow – Real-Time Document Collaboration Engine',
      role: 'Lead Architect & Engineer',
      techStack: 'React, TypeScript, Node.js, WebSockets, Redis, CRDTs',
      description:
        'Engineered a real-time collaborative document workspace supporting multi-cursor editing, offline sync, and conflict-free replicated data types (CRDTs).',
      highlights:
        'Achieved sub-40ms synchronization latency across 5,000 concurrent active document sessions and reduced server memory overhead by 35% through custom binary delta compression.',
    },
    {
      id: 'proj-2',
      title: 'PulseMetrics – High-Throughput Analytics Pipeline',
      role: 'Backend & Data Engineer',
      techStack: 'Go, PostgreSQL, Redis, TimescaleDB, Docker',
      description:
        'Built an ingestion pipeline processing 25,000 telemetry events per second with real-time anomaly detection and visual dashboard querying.',
      highlights:
        'Optimized PostgreSQL partitioning and Redis caching to lower 99th percentile query latency from 850ms to 45ms.',
    },
  ],
  experience: [
    {
      id: 'exp-1',
      role: 'Software Engineer',
      company: 'Aether Cloud Systems',
      period: '2023 – Present',
      description:
        'Developed microservices and frontend dashboards for enterprise Kubernetes monitoring. Reduced P95 API response times by 28% and spearheaded frontend migration to React 18 with server components.',
    },
    {
      id: 'exp-2',
      role: 'Software Engineering Intern',
      company: 'Nova Interactive Labs',
      period: 'Summer 2022',
      description:
        'Implemented streaming telemetry features in React and built an internal automated load testing framework using Go, boosting developer test coverage by 40%.',
    },
  ],
  internships: [
    {
      id: 'int-1',
      role: 'Full-Stack Engineering Intern',
      company: 'DataFlow Systems',
      period: 'Summer 2021',
      description: 'Built automated test suites with Jest and Cypress, reducing regression cycle time by 25%.',
    },
  ],
  certifications: [
    'AWS Certified Solutions Architect – Associate',
    'Meta Certified Front-End Developer',
  ],
  achievements: [
    '1st Place Winner – HackSeattle 2022',
    'Published technical article on real-time WebSockets with 10k+ readers',
  ],
  otherInfo:
    'Passionate about web performance, developer experience, and clean modular code architecture. Active contributor to open-source UI libraries.',
};

export const PROFILE_PRESETS: Record<string, { label: string; profile: CandidateProfile }> = {
  fullstack: {
    label: 'Full-Stack Engineer (Alex Rivera)',
    profile: DEFAULT_CANDIDATE_PROFILE,
  },
  ai_engineer: {
    label: 'AI & ML Engineer (Elena Vance)',
    profile: {
      name: 'Elena Vance',
      targetRole: 'Machine Learning / AI Engineer',
      degree: 'M.S. in Artificial Intelligence & Robotics',
      college: 'Georgia Institute of Technology',
      gradYear: '2024',
      summary:
        'AI engineer specializing in LLM application architecture, Retrieval-Augmented Generation (RAG), fine-tuning, and low-latency inference serving.',
      technicalSkills: [
        'LLM Fine-Tuning',
        'RAG Pipelines',
        'Vector Embeddings',
        'Model Quantization',
        'Prompt Engineering',
        'Model Evaluation',
      ],
      programmingLanguages: ['Python', 'TypeScript', 'C++', 'SQL'],
      frameworks: ['PyTorch', 'Hugging Face', 'LangChain', 'FastAPI', 'React', 'vLLM'],
      toolsDatabases: ['Pinecone', 'Qdrant', 'PostgreSQL (pgvector)', 'Docker', 'AWS Bedrock', 'Weights & Biases'],
      projects: [
        {
          id: 'proj-ai-1',
          title: 'OmniSearch RAG – Enterprise Knowledge Assistant',
          role: 'Core AI Engineer',
          techStack: 'Python, FastAPI, pgvector, LangChain, Gemini API, React',
          description:
            'Designed a hybrid semantic and keyword search engine across 500,000 internal enterprise technical documents with citation verification.',
          highlights:
            'Reduced hallucination rate by 72% using self-reflective RAG loops and delivered average retrieval latency under 120ms.',
        },
      ],
      experience: [
        {
          id: 'exp-ai-1',
          role: 'Machine Learning Intern',
          company: 'NexusAI Research',
          period: '2023 – 2024',
          description:
            'Fine-tuned open-source LLMs on specialized engineering datasets, reducing model parameter size by 4x using LoRA with 98% accuracy retention.',
        },
      ],
      certifications: ['TensorFlow Developer Certificate', 'DeepLearning.AI Generative AI Specialist'],
      otherInfo: 'Published co-author at NeurIPS workshop on efficient vector indexing for multi-tenant applications.',
    },
  },
  frontend: {
    label: 'Senior Frontend Engineer (Jordan Taylor)',
    profile: {
      name: 'Jordan Taylor',
      targetRole: 'Senior Frontend Engineer',
      degree: 'B.S. in Software Engineering',
      college: 'University of Michigan',
      gradYear: '2022',
      summary:
        'Frontend specialist focused on design systems, web performance, accessibility (a11y), and interactive web graphics.',
      technicalSkills: [
        'Web Vitals & Performance',
        'Design Systems',
        'State Architecture',
        'Accessibility (WCAG 2.1 AAA)',
        'Micro-frontends',
        'Responsive Design',
      ],
      programmingLanguages: ['TypeScript', 'JavaScript', 'HTML5', 'CSS3', 'GraphQL'],
      frameworks: ['React', 'Next.js', 'Vue.js', 'TailwindCSS', 'Framer Motion', 'Radix UI'],
      toolsDatabases: ['Storybook', 'Figma', 'Webpack/Vite', 'Jest/Playwright', 'Vercel'],
      projects: [
        {
          id: 'proj-fe-1',
          title: 'Aurora UI – Accessible Enterprise Component Library',
          role: 'Lead Frontend Architect',
          techStack: 'React, TypeScript, TailwindCSS, Storybook, Radix UI',
          description:
            'Created an atomic design system with 45+ accessible, keyboard-navigable components adopted across 14 product teams.',
          highlights:
            'Improved average Lighthouse performance scores from 74 to 98 and slashed UI bug tickets by 50%.',
        },
      ],
      experience: [
        {
          id: 'exp-fe-1',
          role: 'Frontend Engineer',
          company: 'HyperScale Apps',
          period: '2022 – Present',
          description:
            'Optimized core checkout workflows resulting in 14% increase in completion rates. Reduced bundle sizes by 42% through code-splitting and dynamic imports.',
        },
      ],
      certifications: ['Certified Web Accessibility Specialist (WAS)'],
      otherInfo: 'Speaker at local Meetups on building inclusive, fast React interfaces.',
    },
  },
};
