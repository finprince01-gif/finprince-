import { create } from 'zustand';

interface OcrWorkflowState {
  uploadSessionId: string | null;
  step: 'upload' | 'scanning' | 'review' | 'finalizing' | 'done';
  filterStatus: 'ready' | 'pending' | 'scanning';
  setUploadSessionId: (id: string | null) => void;
  setStep: (step: 'upload' | 'scanning' | 'review' | 'finalizing' | 'done') => void;
  setFilterStatus: (status: 'ready' | 'pending' | 'scanning') => void;
  clearWorkflow: () => void;
}

export const useOcrWorkflowStore = create<OcrWorkflowState>((set) => ({
  uploadSessionId: null,
  step: 'upload',
  filterStatus: 'pending',
  setUploadSessionId: (id) => set({ uploadSessionId: id }),
  setStep: (step) => set({ step }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  clearWorkflow: () => set({ uploadSessionId: null, step: 'upload', filterStatus: 'pending' }),
}));
