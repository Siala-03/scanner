import React, { useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  variant?: 'dark' | 'light';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'dark'
}: ModalProps) {
  const isLight = variant === 'light';
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl'
  };

  return (
    <AnimatePresence>
      {isOpen &&
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
          initial={{
            opacity: 0
          }}
          animate={{
            opacity: 1
          }}
          exit={{
            opacity: 0
          }}
          transition={{
            duration: 0.2
          }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose} />

          <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          transition={{
            duration: 0.2,
            ease: 'easeOut'
          }}
          className={`
              relative w-full ${sizeStyles[size]}
              ${isLight 
                ? 'bg-white rounded-2xl shadow-2xl border border-slate-100' 
                : 'bg-slate-700 rounded-2xl shadow-2xl border border-slate-600'
              }
              rounded-b-none sm:rounded-2xl
              max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col
            `}>

            {title &&
          <div className={`flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b ${isLight ? 'border-slate-100' : 'border-[#3a2e20]'}`}>
                <h2 className={`text-xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {title}
                </h2>
                <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              aria-label="Close modal">

                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            }
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{children}</div>
          </motion.div>
        </div>
      }
    </AnimatePresence>);
}
