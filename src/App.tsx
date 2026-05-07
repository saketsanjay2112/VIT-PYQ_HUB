/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  ChevronRight, 
  Download, 
  Upload, 
  View, 
  ArrowLeft,
  X,
  FileText,
  User,
  History,
  Info,
  Calendar,
  Layers,
  LogOut,
  LogIn
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  where,
  type DocumentData,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SENSE_BRANCHES, type Branch, type Subject, type UploadedPaper } from './types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Error handler
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

// Simple Router States
type Page = 'home' | 'branches' | 'years' | 'dashboard' | 'viewer';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(1);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showConfirmSubject, setShowConfirmSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', code: '', professor: '' });
  const [pendingSubject, setPendingSubject] = useState<Subject | null>(null);
  const [uploadedPapers, setUploadedPapers] = useState<UploadedPaper[]>([]);
  const [uploadCount, setUploadCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'Fall' | 'Winter'>('Fall');
  const [activePaperType, setActivePaperType] = useState<'FAT' | 'CAT1' | 'CAT2'>('FAT');
  const [viewingPaper, setViewingPaper] = useState<UploadedPaper | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  // Fetch Subjects Real-time
  useEffect(() => {
    const q = collection(db, 'subjects');
    return onSnapshot(q, (snapshot) => {
      const subjs: Subject[] = [];
      snapshot.forEach((doc) => {
        subjs.push({ id: doc.id, ...doc.data() } as Subject);
      });
      setSubjects(subjs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'subjects'));
  }, []);

  // Fetch Papers Real-time
  useEffect(() => {
    const q = collection(db, 'papers');
    return onSnapshot(q, (snapshot) => {
      const papers: UploadedPaper[] = [];
      snapshot.forEach((doc) => {
        papers.push({ id: doc.id, ...doc.data() } as UploadedPaper);
      });
      setUploadedPapers(papers);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'papers'));
  }, []);

  // Sync upload count from localStorage (per session/device limit)
  useEffect(() => {
    const savedCount = localStorage.getItem('sense_pyq_upload_count');
    if (savedCount) setUploadCount(parseInt(savedCount, 10));
  }, []);

  useEffect(() => {
    localStorage.setItem('sense_pyq_upload_count', uploadCount.toString());
  }, [uploadCount]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no need to log it as a critical error
        return;
      }
      if (error.code === 'auth/cancelled-by-user') {
        return;
      }
      console.error('Login Error:', error);
      alert(`Login failed: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const handleAddSubjectRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please login to contribute.");
      return;
    }
    if (!selectedBranch || !newSubject.name || !newSubject.code) return;

    const subject: Subject = {
      id: '', // Will be set by Firestore
      name: newSubject.name,
      code: newSubject.code.toUpperCase(),
      professor: newSubject.professor || 'Not Specified',
      year: selectedYear,
      semester: activeTab,
      branchId: selectedBranch.id // Added branchId support
    } as any;

    setPendingSubject(subject);
    setShowConfirmSubject(true);
  };

  const handleConfirmAdd = async () => {
    if (!selectedBranch || !pendingSubject || !user) return;

    try {
      const docRef = await addDoc(collection(db, 'subjects'), {
        ...pendingSubject,
        branchId: selectedBranch.id,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
      
      setNewSubject({ name: '', code: '', professor: '' });
      setPendingSubject(null);
      setShowConfirmSubject(false);
      setShowAddSubject(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'subjects');
    }
  };

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch);
    setCurrentPage('years');
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    setCurrentPage('dashboard');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSubject) return;

    if (!user) {
      alert("Please login to contribute.");
      return;
    }

    if (uploadCount >= 10) {
      alert("You have reached the limit of 10 uploads per session.");
      return;
    }

    const examYear = parseInt(prompt("Enter the year of the paper (e.g. 2023):") || new Date().getFullYear().toString());

    // Convert file to base64 for simplified storage without Firebase Storage
    // NOTE: In production, use Firebase Storage. This is limited by Firestore 1MB doc size.
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      
      if (base64.length > 800000) { // Approx 800KB limit for base64 string to keep under 1MB Firestore limit
        alert("File too large. Please upload files smaller than 500KB for this demo.");
        return;
      }

      const paperData = {
        subjectId: selectedSubject.id,
        year: selectedYear,
        semester: activeTab,
        type: activePaperType,
        fileName: file.name,
        fileUrl: base64,
        uploadedAt: new Date().toISOString(),
        examYear: examYear,
        uploadedBy: user.uid
      };

      try {
        const docRef = await addDoc(collection(db, 'papers'), paperData);
        setUploadCount(prev => prev + 1);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Automatically open for viewing
        setViewingPaper({ id: docRef.id, ...paperData } as UploadedPaper);
        setCurrentPage('viewer');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'papers');
      }
    };
    reader.readAsDataURL(file);
  };

  const renderHome = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center justify-center min-h-screen text-center px-4"
    >
      <div className="mb-8 p-4 bg-lime-500/10 rounded-2xl border border-lime-500/20">
        <BookOpen className="w-12 h-12 text-lime-400" />
      </div>
      <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-4 text-white uppercase italic">
        VIT VELLORE <span className="text-lime-400 not-italic">SENSE</span>
      </h1>
      <h2 className="text-2xl md:text-3xl font-light text-neutral-400 mb-8 tracking-wide">
        M.TECH - ALL BRANCHES PYQ'S
      </h2>
      <p className="max-w-2xl text-neutral-500 mb-6 leading-relaxed text-lg font-medium">
        The community-driven repository for Previous Year Questions (PYQ) in the SENSE department. 
        Build and share resources with your fellow students.
      </p>

      <div className="mb-12 inline-flex items-center gap-2 px-6 py-3 bg-lime-500/10 border border-lime-500/30 rounded-2xl text-lime-400 text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(163,230,53,0.1)]">
        <Info className="w-4 h-4" />
        NOTE: Developed & maintained by students. Not an official VIT site.
      </div>
      
      <button 
        id="explore-btn"
        onClick={() => setCurrentPage('branches')}
        className="group relative px-12 py-5 bg-lime-500 text-black font-black rounded-3xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-lime-500/40"
      >
        <span className="relative z-10 flex items-center gap-3 text-lg uppercase tracking-widest">
          ENTER HUB <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </span>
      </button>
    </motion.div>
  );

  const renderBranches = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-28 pb-12 px-6 max-w-7xl mx-auto"
    >
      <div className="flex flex-col mb-12">
        <button onClick={() => setCurrentPage('home')} className="self-start flex items-center gap-2 text-neutral-400 hover:text-lime-400 transition-colors mb-6 bg-neutral-900 px-4 py-2 rounded-xl border border-white/5 shadow-xl text-xs font-black uppercase tracking-widest group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
        </button>
        <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Select Branch</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SENSE_BRANCHES.map((branch) => (
          <motion.div 
            key={branch.id}
            whileHover={{ y: -8, scale: 1.02 }}
            className="group bg-neutral-900/40 backdrop-blur-md border border-white/5 p-8 rounded-[2rem] hover:border-lime-500/30 transition-all cursor-pointer relative overflow-hidden shadow-2xl"
            onClick={() => handleBranchSelect(branch)}
          >
            <div className="flex flex-col h-full relative z-10">
              <div className="flex justify-between items-start mb-8">
                <div className="w-14 h-14 bg-lime-500/10 rounded-2xl flex items-center justify-center border border-lime-500/20 group-hover:bg-lime-500 transition-colors duration-500">
                  <Layers className="w-7 h-7 text-lime-400 group-hover:text-black transition-colors duration-500" />
                </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-1">M.Tech</div>
                    <div className="text-2xl font-mono text-neutral-600">
                      {uploadedPapers.filter(p => {
                        const subj = (subjects || []).find(s => s.id === p.subjectId && s.branchId === branch.id);
                        return !!subj;
                      }).length}
                    </div>
                  </div>
              </div>
              
              <h3 className="text-2xl font-black text-white mb-3 group-hover:text-lime-400 transition-colors leading-tight uppercase italic">{branch.name}</h3>
              <p className="text-neutral-500 text-sm mb-8 leading-relaxed">{branch.description}</p>
              
              <div className="mt-auto flex items-center justify-between pt-6 border-t border-white/5">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <Calendar className="w-3.5 h-3.5" /> 2 Years
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <BookOpen className="w-3.5 h-3.5" /> 4 SEM
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-lime-500 group-hover:text-black transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  const renderYears = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="min-h-screen pt-28 pb-12 px-6 max-w-7xl mx-auto flex flex-col items-start"
    >
      <button onClick={() => setCurrentPage('branches')} className="flex items-center gap-2 text-neutral-400 hover:text-lime-400 transition-colors mb-8 bg-neutral-900 px-4 py-2 rounded-xl border border-white/5 shadow-xl text-xs font-black uppercase tracking-widest group">
         <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
      </button>

      <div className="w-full flex flex-col items-center justify-center flex-1">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-black text-white italic uppercase mb-4 tracking-tighter">Academic Year</h2>
          <p className="text-lime-400 font-bold uppercase tracking-widest">{selectedBranch?.name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          {[1, 2].map((year) => (
            <motion.div 
              key={year}
              whileHover={{ y: -10, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleYearSelect(year)}
              className="group bg-neutral-900 border-2 border-white/5 p-12 rounded-[3.5rem] text-center cursor-pointer hover:border-lime-500 transition-all relative overflow-hidden shadow-2xl"
            >
              <div className="relative z-10">
                <div className="text-8xl font-black mb-6 text-white/5 group-hover:text-lime-500/10 transition-colors">0{year}</div>
                <h3 className="text-4xl font-black text-white mb-2 italic">Year {year}</h3>
                <p className="text-neutral-500 uppercase tracking-widest text-xs font-bold">
                  {year === 1 ? 'Freshman Level' : 'Advanced Thesis Level'}
                </p>
                <div className="mt-8 flex justify-center">
                   <div className="px-6 py-2 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-400 group-hover:bg-lime-500 group-hover:text-black transition-all">
                      Open Repository
                   </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );

  const renderDashboard = () => {
    const activeSubjects = subjects
      .filter(sub => sub.branchId === selectedBranch?.id && sub.semester === activeTab && sub.year === selectedYear)
      .filter(sub => 
        sub.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        sub.code.toLowerCase().includes(searchQuery.toLowerCase())
      );

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen pt-28 pb-12 px-6 max-w-7xl mx-auto"
      >
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12 border-b border-white/5 pb-8">
          <div className="space-y-4">
            <button onClick={() => setCurrentPage('years')} className="flex items-center gap-2 text-xs text-neutral-400 hover:text-lime-400 transition-colors bg-neutral-900 px-3 py-1.5 rounded-full border border-white/5 shadow-xl">
              <ArrowLeft className="w-3 h-3" /> Back to Year Select
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="px-2 py-0.5 bg-lime-500 text-black text-[10px] font-black rounded uppercase italic">Year {selectedYear}</span>
                <span className="text-neutral-500 font-mono text-[10px]">#SENSE_PYQ_HUB</span>
              </div>
              <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">{selectedBranch?.name}</h2>
            </div>
          </div>
          
          <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5">
            <button 
              onClick={() => setActiveTab('Fall')}
              className={`px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'Fall' ? 'bg-lime-500 text-black shadow-xl' : 'text-neutral-500 hover:text-white'}`}
            >
              Fall SEM
            </button>
            <button 
              onClick={() => setActiveTab('Winter')}
              className={`px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'Winter' ? 'bg-lime-500 text-black shadow-xl' : 'text-neutral-500 hover:text-white'}`}
            >
              Winter SEM
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Subjects List */}
          <div className="xl:col-span-8 space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
              <div className="relative w-full md:w-96">
                <input 
                  type="text" 
                  placeholder="Search by Code (e.g. ECE1001) or Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-neutral-900 border-2 border-white/5 rounded-2xl focus:border-lime-500 focus:ring-0 outline-none transition-all text-sm font-bold text-white placeholder-neutral-600 shadow-xl"
                />
                <Info className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-600 pointer-events-none" />
              </div>

              <button 
                onClick={() => setShowAddSubject(true)}
                className="w-full md:w-auto px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-lime-500 transition-colors shadow-2xl active:scale-95"
              >
                + Add Subject
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
              <div className="col-span-full flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-neutral-500 uppercase tracking-[0.2em]">Curriculum Index</h3>
                <div className="text-[10px] text-lime-500/50 font-mono">COUNT: {activeSubjects.length}</div>
              </div>

              {activeSubjects.map((subject) => (
                <motion.div 
                  key={subject.id}
                  onClick={() => setSelectedSubject(subject)}
                  whileHover={{ x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  className={`p-6 rounded-[1.5rem] border-2 transition-all cursor-pointer relative overflow-hidden group shadow-xl ${
                    selectedSubject?.id === subject.id 
                    ? 'bg-lime-500/10 border-lime-500' 
                    : 'bg-neutral-900/40 border-white/5 hover:border-lime-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${selectedSubject?.id === subject.id ? 'bg-lime-500 text-black' : 'bg-white/5 text-neutral-600'}`}>
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-lime-400 uppercase bg-lime-500/10 px-1.5 py-0.5 rounded">{subject.code}</span>
                        </div>
                        <div className={`font-black text-lg leading-tight transition-colors mt-1 ${selectedSubject?.id === subject.id ? 'text-white' : 'text-neutral-300'}`}>{subject.name}</div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1.5 mt-1">
                          <User className="w-3 h-3" /> Prof. {subject.professor}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {selectedSubject?.id === subject.id && (
                    <div className="absolute right-0 top-0 h-full w-1.5 bg-lime-500 shadow-[0_0_15px_rgba(163,230,53,0.5)]" />
                  )}
                </motion.div>
              ))}

              {activeSubjects.length === 0 && (
                <div className="col-span-full py-24 text-center bg-neutral-900/40 rounded-[2rem] border-2 border-dashed border-white/5 italic">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-neutral-600" />
                  </div>
                  <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">No subjects found for this category</p>
                  <button onClick={() => setShowAddSubject(true)} className="mt-4 text-lime-400 text-xs font-black uppercase tracking-tighter hover:underline">Add First Subject</button>
                </div>
              )}
            </div>
          </div>

          {/* Paper Detail / Upload Section */}
          <div className="xl:col-span-4">
            <AnimatePresence mode="wait">
              {selectedSubject ? (
                <motion.div 
                  key={selectedSubject.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-neutral-900 border-2 border-white/5 rounded-[2.5rem] p-8 shadow-2xl shadow-black sticky top-28"
                >
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 bg-gradient-to-br from-lime-500 to-lime-600 rounded-2xl flex items-center justify-center font-black text-2xl text-black italic">
                      {selectedSubject.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-lime-400 font-black uppercase tracking-widest mb-1">{selectedSubject.code}</div>
                      <h4 className="font-black text-white uppercase italic tracking-tighter truncate text-xl">{selectedSubject.name}</h4>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                          <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Target Exam</span>
                          <span className="text-[10px] text-neutral-600 font-mono">SEMESTER: {activeTab.toUpperCase()}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                         {['CAT1', 'CAT2', 'FAT'].map((t) => (
                           <button 
                            key={t}
                            onClick={() => setActivePaperType(t as any)}
                            className={`py-3 text-[10px] font-black rounded-xl border-2 uppercase tracking-tighter transition-all ${
                              activePaperType === t 
                              ? 'bg-lime-500 border-lime-500 text-black shadow-lg shadow-lime-500/20' 
                              : 'bg-white/5 border-transparent text-neutral-500 hover:border-white/10'
                            }`}
                           >
                             {t}
                           </button>
                         ))}
                      </div>
                    </div>

                    <div className="group p-8 bg-lime-500/5 rounded-3xl border-2 border-dashed border-lime-500/20 flex flex-col items-center justify-center text-center transition-all hover:border-lime-500/40 hover:bg-lime-500/10">
                      <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4 shadow-xl group-hover:scale-110 transition-transform duration-500">
                        <Upload className="w-8 h-8 text-lime-400" />
                      </div>
                      <div className="text-base font-black text-white mb-1 leading-none uppercase italic">Contribute Paper</div>
                      <div className="text-[10px] text-neutral-600 mb-6 uppercase tracking-[0.2em] font-bold">PDF, JPG, or PNG</div>
                      
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadCount >= 10}
                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          uploadCount >= 10 
                          ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed' 
                          : 'bg-white text-black hover:bg-lime-500 shadow-2xl'
                        }`}
                      >
                        {uploadCount >= 10 ? 'UPLOAD LIMIT REACHED' : 'BROWSE FILES'}
                      </button>
                      <input 
                        type="file" 
                        hidden 
                        ref={fileInputRef} 
                        onChange={handleFileUpload}
                        accept="application/pdf,image/*"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-neutral-500">SESSION HEALTH</span>
                        <span className={`${uploadCount >= 10 ? 'text-lime-400' : 'text-neutral-400'}`}>{uploadCount}/10 ALLOWED</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(uploadCount / 10) * 100}%` }}
                          className={`h-full transition-colors duration-500 ${uploadCount >= 10 ? 'bg-lime-600' : 'bg-lime-400'}`} 
                        />
                      </div>
                    </div>

                    {/* List of uploaded */}
                    <div className="pt-2">
                       <h5 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4">Vault ({activePaperType})</h5>
                       <div className="space-y-3">
                         {uploadedPapers
                           .filter(p => p.subjectId === selectedSubject.id && p.semester === activeTab && p.type === activePaperType && p.year === selectedYear)
                           .map(paper => (
                             <div key={paper.id} className="flex items-center justify-between p-4 bg-neutral-800/50 border border-white/5 rounded-2xl group/item hover:border-lime-500/30 transition-all shadow-xl">
                               <div className="flex items-center gap-3 overflow-hidden shrink-0 flex-1">
                                 <div className="p-2 bg-lime-500/10 rounded-lg shrink-0">
                                   <FileText className="w-4 h-4 text-lime-400" />
                                 </div>
                                 <div className="flex flex-row items-center gap-3 min-w-0 flex-1">
                                   <span className="text-sm font-black text-white truncate max-w-[60%]">{paper.fileName}</span>
                                   <span className="px-2 py-0.5 bg-lime-500/10 text-[10px] font-mono text-lime-400 border border-lime-500/20 rounded-md shrink-0">
                                     {paper.examYear || 'N/A'}
                                   </span>
                                 </div>
                               </div>
                               <div className="flex gap-2 ml-4">
                                 <button 
                                   onClick={() => { setViewingPaper(paper); setCurrentPage('viewer'); }}
                                   className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-neutral-500 hover:bg-lime-500 hover:text-black transition-all"
                                   title="View Fullscreen"
                                 >
                                   <View className="w-4 h-4" />
                                 </button>
                                 <a 
                                   href={paper.fileUrl} 
                                   download={paper.fileName}
                                   className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-neutral-500 hover:bg-emerald-500 hover:text-black transition-all"
                                   title="Download"
                                 >
                                   <Download className="w-4 h-4" />
                                 </a>
                               </div>
                             </div>
                           ))}
                         {uploadedPapers.filter(p => p.subjectId === selectedSubject.id && p.semester === activeTab && p.type === activePaperType && p.year === selectedYear).length === 0 && (
                           <div className="flex flex-col items-center justify-center py-10 opacity-20">
                             <History className="w-8 h-8 mb-2" />
                             <div className="text-[10px] font-bold uppercase tracking-widest">Index empty</div>
                           </div>
                         )}
                       </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center text-center p-12 bg-neutral-900 border-2 border-white/5 rounded-[2.5rem] text-neutral-700 relative overflow-hidden group shadow-2xl">
                  <Info className="w-16 h-16 mb-6 opacity-10 group-hover:scale-110 transition-transform duration-700" />
                  <p className="font-bold text-sm uppercase tracking-widest leading-relaxed">Select a subject code<br/>from the repository</p>
                  <div className="absolute inset-0 bg-lime-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Add Subject Modal */}
        <AnimatePresence>
          {showAddSubject && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setShowAddSubject(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-neutral-900 w-full max-w-md rounded-[2.5rem] p-10 border border-white/10 shadow-3xl"
              >
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">New Subject</h3>
                <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest mb-8">Add to Year {selectedYear} / {activeTab} SEM</p>
                
                <form onSubmit={handleAddSubjectRequest} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Subject Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Digital Image Processing"
                      required
                      value={newSubject.name}
                      onChange={(e) => setNewSubject({...newSubject, name: e.target.value})}
                      className="w-full px-6 py-4 bg-black border border-white/5 rounded-2xl focus:border-lime-500 outline-none transition-all font-bold text-white placeholder-neutral-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Subject Code</label>
                      <input 
                        type="text" 
                        placeholder="ECE1001"
                        required
                        value={newSubject.code}
                        onChange={(e) => setNewSubject({...newSubject, code: e.target.value})}
                        className="w-full px-6 py-4 bg-black border border-white/5 rounded-2xl focus:border-lime-500 outline-none transition-all font-bold text-white placeholder-neutral-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Professor Name</label>
                      <input 
                        type="text" 
                        placeholder="Dr. Smith"
                        value={newSubject.professor}
                        onChange={(e) => setNewSubject({...newSubject, professor: e.target.value})}
                        className="w-full px-6 py-4 bg-black border border-white/5 rounded-2xl focus:border-lime-500 outline-none transition-all font-bold text-white placeholder-neutral-700"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowAddSubject(false)}
                      className="flex-1 py-4 text-neutral-500 font-black uppercase tracking-widest text-xs hover:text-white"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 py-4 bg-lime-500 text-black rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl shadow-lime-500/20 active:scale-95 hover:bg-lime-400 transition-colors"
                    >
                      Save Subject
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Verification Confirmation Modal */}
        <AnimatePresence>
          {showConfirmSubject && pendingSubject && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-neutral-900 w-full max-w-md rounded-[3rem] p-10 border border-lime-500/30 shadow-[0_0_50px_rgba(163,230,53,0.15)]"
              >
                <div className="w-16 h-16 bg-lime-500/10 rounded-2xl flex items-center justify-center mb-8 mx-auto border border-lime-500/20">
                  <Info className="w-8 h-8 text-lime-400" />
                </div>

                <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4 text-center">Verify Details</h3>
                <p className="text-neutral-400 text-sm text-center mb-10">Please confirm you are adding this subject to the correct year and semester category.</p>
                
                <div className="space-y-4 mb-10">
                  <div className="p-5 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Subject</span>
                      <span className="text-sm font-black text-white truncate">{pendingSubject.name}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                       <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Code</span>
                       <span className="text-sm font-black text-lime-400">{pendingSubject.code}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                       <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Academic Year</span>
                       <span className="text-sm font-black text-white">Year {pendingSubject.year}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Semester</span>
                       <span className="text-sm font-black text-white">{pendingSubject.semester.toUpperCase()} SEM</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowConfirmSubject(false)}
                    className="flex-1 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                  >
                    Go Back
                  </button>
                  <button 
                    onClick={handleConfirmAdd}
                    className="flex-1 py-5 bg-lime-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-lime-500/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    Confirm & Save
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderViewer = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col"
    >
      <div className="p-6 flex items-center justify-between border-b border-white/10 bg-black/50">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setCurrentPage('dashboard')} 
            className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-xl transition-all font-bold text-sm uppercase tracking-widest text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Exit Space
          </button>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="flex flex-col">
            <span className="font-black text-white italic uppercase tracking-tighter">{viewingPaper?.fileName}</span>
            <span className="text-[10px] text-lime-400 font-bold uppercase tracking-widest">{activePaperType} | Year {selectedYear} | {viewingPaper?.examYear}</span>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => {
              if (viewingPaper) window.open(viewingPaper.fileUrl, '_blank');
            }}
            className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Open Original
          </button>
          <a 
            href={viewingPaper?.fileUrl} 
            download={viewingPaper?.fileName}
            className="flex items-center gap-3 px-8 py-3 bg-lime-500 text-black rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-lime-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Download className="w-5 h-5" /> Save Copy
          </a>
        </div>
      </div>
      <div className="flex-1 p-4 sm:p-8 flex items-center justify-center overflow-auto bg-black/40">
        <div className="w-full h-full max-w-6xl bg-neutral-900 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-3xl">
          {viewingPaper?.fileName.toLowerCase().endsWith('.pdf') ? (
            <iframe 
              src={`${viewingPaper.fileUrl}#toolbar=0`} 
              className="w-full h-full border-none bg-white" 
              title="PDF Viewer"
            />
          ) : (
            <div className="w-full h-full p-4 flex items-center justify-center bg-black/20">
               <img 
                 src={viewingPaper?.fileUrl} 
                 alt="Paper View" 
                 className="max-w-full max-h-full object-contain shadow-2xl" 
               />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className={`min-h-screen transition-colors duration-700 font-sans selection:bg-lime-500/20 bg-neutral-950 text-white`}>
      {/* Cinematic Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] blur-[160px] rounded-full transition-colors duration-700 bg-lime-900/20" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] blur-[140px] rounded-full transition-colors duration-700 bg-emerald-900/10" />
      </div>

      <main className="relative z-10 w-full">
        <AnimatePresence mode="wait">
          {currentPage === 'home' && renderHome()}
          {currentPage === 'branches' && renderBranches()}
          {currentPage === 'years' && renderYears()}
          {currentPage === 'dashboard' && renderDashboard()}
          {currentPage === 'viewer' && renderViewer()}
        </AnimatePresence>
      </main>

      {/* Futuristic Global Header */}
      {currentPage !== 'home' && currentPage !== 'viewer' && (
        <header className="fixed top-0 left-0 right-0 z-40 px-6 py-6 transition-all duration-500">
          <div className="max-w-7xl mx-auto flex items-center justify-between glass px-8 py-5 rounded-[2rem] shadow-2xl">
            <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setCurrentPage('home')}>
               <div className="w-10 h-10 bg-lime-500 rounded-2xl flex items-center justify-center shadow-lime-500/20 group-hover:rotate-12 transition-transform">
                  <BookOpen className="w-6 h-6 text-black" />
               </div>
               <div className="flex flex-col">
                 <span className="font-black tracking-tighter text-white italic text-lg leading-none uppercase">SENSE <span className="text-lime-400 not-italic">HUB</span></span>
                 <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-[0.3em] mt-1">Student Operated</span>
               </div>
            </div>
            
            <nav className="hidden lg:flex items-center gap-2">
               <button onClick={() => setCurrentPage('branches')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'branches' ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'}`}>Branch</button>
               <div className="w-1 h-1 bg-white/10 rounded-full mx-1" />
               <button onClick={() => selectedBranch && setCurrentPage('years')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'years' ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'}`}>Year</button>
               <div className="w-1 h-1 bg-white/10 rounded-full mx-1" />
               <button onClick={() => selectedBranch && setCurrentPage('dashboard')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'dashboard' ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'}`}>Dashboard</button>
            </nav>

            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-black text-lime-400 uppercase tracking-widest">{uploadCount}/10</span>
                <span className="text-[8px] text-neutral-500 uppercase tracking-widest mt-0.5">Quota Health</span>
              </div>
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-white uppercase truncate max-w-[100px]">{user.displayName}</span>
                    <button onClick={handleLogout} className="text-[8px] text-lime-400 font-bold uppercase hover:underline">Logout</button>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-neutral-400" />
                    )}
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-6 py-3 bg-lime-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-lime-500/20"
                >
                  <LogIn className="w-4 h-4" /> Login
                </button>
              )}
            </div>
          </div>
        </header>
      )}
    </div>
  );
}
