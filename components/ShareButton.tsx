'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChalkSpec } from '@/lib/schemas';

interface ShareButtonProps {
  spec: ChalkSpec;
  prompt: string;
}

type ShareState = 'idle' | 'loading' | 'copied' | 'error';

function ShareIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3v11.25"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx={12}
        cy={12}
        r={10}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}

const iconVariants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
};

export function ShareButton({ spec, prompt }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');

  const handleShare = useCallback(async () => {
    if (state === 'loading' || state === 'copied') return;

    setState('loading');

    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, prompt }),
      });

      if (!response.ok) {
        throw new Error(`Share failed: ${response.status}`);
      }

      const { url } = await response.json();
      await navigator.clipboard.writeText(url);

      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }, [spec, prompt, state]);

  const isCopied = state === 'copied';
  const isError = state === 'error';
  const isLoading = state === 'loading';

  return (
    <motion.button
      type="button"
      onClick={handleShare}
      disabled={isLoading}
      whileTap={{ scale: 0.95 }}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-colors duration-200 cursor-pointer disabled:cursor-wait
        ${isCopied
          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          : isError
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-chalk-surface/50 border border-chalk-border/30 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/50'
        }
      `}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isLoading && (
          <motion.span
            key="spinner"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex items-center"
          >
            <Spinner />
          </motion.span>
        )}
        {isCopied && (
          <motion.span
            key="check"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex items-center"
          >
            <CheckIcon />
          </motion.span>
        )}
        {(state === 'idle' || isError) && (
          <motion.span
            key="share"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex items-center"
          >
            <ShareIcon />
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {isLoading && (
          <motion.span
            key="text-loading"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
          >
            Sharing...
          </motion.span>
        )}
        {isCopied && (
          <motion.span
            key="text-copied"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
          >
            Copied!
          </motion.span>
        )}
        {isError && (
          <motion.span
            key="text-error"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
          >
            Error
          </motion.span>
        )}
        {state === 'idle' && (
          <motion.span
            key="text-idle"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
          >
            Share
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
