import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'default' | 'pills';
  className?: string;
}
export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
  className = ''
}: TabsProps) {
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0
  });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const activeTabEl = tabRefs.current[activeIndex];
    if (activeTabEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeTabEl.getBoundingClientRect();
      setIndicatorStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width
      });
    }
  }, [activeTab, tabs]);
  if (variant === 'pills') {
    return (
      <div className={`flex gap-2 overflow-x-auto pb-2 ${className}`}>
        {tabs.map((tab) =>
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
              flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all duration-200
              ${activeTab === tab.id ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'}
            `}>

            {tab.icon}
            {tab.label}
            {tab.count !== undefined &&
          <span
            className={`
                px-1.5 py-0.5 rounded-full text-xs
                ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}
              `}>

                {tab.count}
              </span>
          }
          </button>
        )}
      </div>);

  }
  return (
    <div
      ref={containerRef}
      className={`relative flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto ${className}`}>

      {tabs.map((tab, index) =>
      <button
        key={tab.id}
        ref={(el) => {
          tabRefs.current[index] = el;
        }}
        onClick={() => onTabChange(tab.id)}
        className={`
            flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors duration-200
            ${activeTab === tab.id ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}
          `}>

          {tab.icon}
          {tab.label}
          {tab.count !== undefined &&
        <span
          className={`
              px-1.5 py-0.5 rounded-full text-xs
              ${activeTab === tab.id ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}
            `}>

              {tab.count}
            </span>
        }
        </button>
      )}
      <motion.div
        className="absolute bottom-0 h-0.5 bg-amber-500"
        animate={indicatorStyle}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30
        }} />

    </div>);

}