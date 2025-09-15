import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  Accept: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal = ({ isOpen, onClose, title, children, Accept }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex  items-center justify-center">

      
      {/* Modal Content */}
      <div className="relative flex flex-col justify-center content-center bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 z-50">
        {/* Header */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-purple-400 border-b dark:border-gray-700">
          <h2 className="text-xl text-center font-bold text-white dark:text-gray">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-white font-bold hover:text-gray-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-8 text-center">
          {children}
        </div>
        <div className = "flex justify-center">
           <button
            onClick={Accept}
            className="text-white bg-blue-300 max-w-[80px] p-2 m-4 rounded-lg hover:text-gray-500 focus:outline-none"
          > Accept </button>
        </div>
       
      </div>
    </div>
  );
};

export default Modal;