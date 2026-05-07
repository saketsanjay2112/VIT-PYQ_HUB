export type Branch = {
  id: string;
  name: string;
  description: string;
  papersCount: number;
  years: number[];
};

export type Subject = {
  id: string;
  name: string;
  code: string;
  professor: string;
  year: number;
  semester: 'Fall' | 'Winter';
  lastPaperYear?: number;
};

export type UploadedPaper = {
  id: string;
  subjectId: string;
  year: number; // Academic year (1 or 2)
  semester: 'Fall' | 'Winter';
  type: 'FAT' | 'CAT1' | 'CAT2';
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  examYear?: number; // The year the exam was held (e.g. 2023)
};

export const SENSE_BRANCHES: Branch[] = [
  {
    id: 'mtech-vlsi',
    name: 'M.Tech VLSI Design',
    description: 'Expertise in chip design, semiconductor physics, and hardware-software co-design.',
    papersCount: 0,
    years: [1, 2],
  },
  {
    id: 'mtech-embedded',
    name: 'M.Tech Embedded Systems',
    description: 'Specialized in real-time systems, IoT, and high-performance microcontroller programming.',
    papersCount: 0,
    years: [1, 2],
  },
  {
    id: 'mtech-ics',
    name: 'M.Tech Intelligent Communication Systems',
    description: 'Advanced wireless communications, 5G/6G technologies, and signal processing.',
    papersCount: 0,
    years: [1, 2],
  },
  {
    id: 'mtech-automotive',
    name: 'M.Tech Automotive Engineering',
    description: 'Electric vehicles, autonomous driving systems, and automotive electronics.',
    papersCount: 0,
    years: [1, 2],
  },
  {
    id: 'mtech-power',
    name: 'M.Tech Power Electronics',
    description: 'Energy conversion, smart grids, and high-power electronic systems.',
    papersCount: 0,
    years: [1, 2],
  },
  {
    id: 'mtech-iot',
    name: 'M.Tech IoT and Sensor Systems',
    description: 'Sensor networks, edge computing, and smart system integration.',
    papersCount: 0,
    years: [1, 2],
  }
];

export const BRANCH_SUBJECTS: Record<string, Subject[]> = {
  // Empty for users to add
};
