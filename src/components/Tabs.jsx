import React, { useState } from 'react';

/**
 * Tab component for selecting a single tab
 * @param {Object} props - Component props
 * @param {string} props.value - Tab value
 * @param {React.ReactNode} props.children - Tab label
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.active - Whether the tab is active
 */
export function Tab({ value, children, onClick, active }) {
  return (
    <button
      className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 ${
        active
          ? 'text-primary-600 dark:text-primary-400 border-primary-500 dark:border-primary-400 bg-white dark:bg-gray-800'
          : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  );
}

/**
 * TabPanel component for displaying tab content
 * @param {Object} props - Component props
 * @param {string} props.value - Tab value
 * @param {string} props.activeTab - Currently active tab
 * @param {React.ReactNode} props.children - Tab content
 * @param {string} props.className - Additional CSS classes
 */
export function TabPanel({ value, activeTab, children, className = '' }) {
  if (value !== activeTab) return null;
  
  return (
    <div className={className}>
      {children}
    </div>
  );
}

/**
 * Tabs component for managing a set of tabs
 * @param {Object} props - Component props
 * @param {string} props.defaultTab - Default active tab
 * @param {Function} props.onChange - Change handler
 * @param {React.ReactNode} props.children - Tab components
 */
export function Tabs({ defaultTab, onChange, children }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (onChange) onChange(tab);
  };
  
  return (
    <div className="tabs">
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {React.Children.map(children, (child) => {
          if (child?.type !== Tab) return null;
          
          return React.cloneElement(child, {
            onClick: handleTabChange,
            active: child.props.value === activeTab
          });
        })}
      </div>
      <div className="tab-content">
        {React.Children.map(children, (child) => {
          if (child?.type !== TabPanel) return null;
          
          return React.cloneElement(child, {
            activeTab
          });
        })}
      </div>
    </div>
  );
}
