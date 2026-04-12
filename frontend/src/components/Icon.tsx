import React from 'react';

type IconName = 'dashboard' | 'layout-dashboard' | 'masters' | 'inventory' | 'vouchers' | 'banking' | 'bank' | 'reports' | 'plus' | 'trash' | 'upload' | 'close' | 'warning' | 'settings' | 'logout' | 'sparkles' | 'arrow-up-right' | 'arrow-down-left' | 'users' | 'wallet' | 'download' | 'check-circle' | 'x-circle' | 'spinner' | 'wand-sparkles' | 'bot' | 'vendor-portal' | 'customer-portal' | 'payroll' | 'service' | 'gst' | 'ledger' | 'search' | 'clock' | 'inbox' | 'x' | 'exclamation-triangle' | 'edit' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'document' | 'check' | 'scanner' | 'tag' | 'save' | 'menu' | 'receipt' | 'file-text' | 'file-spreadsheet' | 'bar-chart-2' | 'edit-3' | 'user-plus' | 'trash-2' | 'alert-circle' | 'loader' | 'arrow-left' | 'arrow-right' | 'refresh' | 'link' | 'calendar' | 'skip-forward' | 'info' | 'eye' | 'eye-off' | 'more-vertical' | 'key' | 'slash' | 'location';


interface IconProps {
  name: IconName;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

const Icon: React.FC<IconProps> = ({ name, className = '', size, style }) => {
  const sizeStyle = size ? { width: `${size}px`, height: `${size}px` } : {};
  const combinedStyle = { ...sizeStyle, ...style };
  const defaultSizeClass = !size && !className.includes('w-') ? 'w-5 h-5' : '';
  const combinedClassName = `${defaultSizeClass} ${className}`.trim();

  const icons: Record<IconName, React.ReactElement> = {
    // SIDEBAR ICONS - Enhanced Professional Detail Style
    dashboard: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 7H3M17 10V3M21 17h-7M7 14v7" opacity={0.5} />
      </>
    ),

    edit: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 3l5 5L8 21H3v-5L16 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l4 4" opacity={0.5} />
      </>
    ),

    'layout-dashboard': (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" strokeWidth={1.5} />
        <rect x="14" y="3" width="7" height="5" rx="1" strokeWidth={1.5} />
        <rect x="14" y="12" width="7" height="9" rx="1" strokeWidth={1.5} />
        <rect x="3" y="16" width="7" height="5" rx="1" strokeWidth={1.5} />
      </>
    ),

    ledger: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8h2m-2 4h2" opacity={0.5} />
      </>
    ),

    masters: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7V4a1 1 0 011-1h14a1 1 0 011 1v3M4 7l2 14h12l2-14M4 7h16" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h4" opacity={0.5} />
      </>
    ),

    inventory: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4v10l8 4 8-4V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21v-10M12 11l8-4M12 11l-8-4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 4.5l-4 2-4-2" opacity={0.5} />
      </>
    ),

    vouchers: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 3v4a1 1 0 001 1h4" />
      </>
    ),
    receipt: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" />
      </>
    ),

    'vendor-portal': (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M3 10h18M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3m-14 0v11m14-11v11M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 13h2m6 0h2" opacity={0.5} />
      </>
    ),

    'customer-portal': (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 8l2 2-2 2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10h-6" opacity={0.5} />
      </>
    ),

    payroll: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2zm3-5a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 12h.01m2.99 0h.01" opacity={0.5} />
      </>
    ),

    service: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.77 3.77z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 12l-3 3" opacity={0.5} />
      </>
    ),

    gst: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m-6 4h6m-6 4h6M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v14M9 5v14" opacity={0.3} />
      </>
    ),

    reports: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21H3V3" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V10M11 16V7M15 16V12M19 16V5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3l18 18" opacity={0.1} />
      </>
    ),

    users: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" />
      </>
    ),

    settings: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
      </>
    ),

    logout: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />,

    // Utility icons
    bank: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21V10m14 11V10M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3L2 9h20L12 3z" />
      </>
    ),
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />,
    trash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
    upload: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />,
    download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
    close: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    warning: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
    'exclamation-triangle': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
    sparkles: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l.663 1.327L7 5l-1.337.673L5 7l-.663-1.327L3 5l1.337-.673L5 3zM12 7l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM19 13l1.327 2.653L23 17l-2.673 1.347L19 21l-1.327-2.653L15 17l2.673-1.347L19 13z" />,
    'wand-sparkles': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 4l-2 2h3v12l-3 2h2l3-2V6h3l-2-2m-11 5l3 3m0 0l3-3m-3 3V3m-4 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />,
    'arrow-up-right': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7m0 0H8m9 0v9" />,
    'arrow-down-left': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7L7 17m0 0h9m-9 0V8" />,
    wallet: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />,
    'check-circle': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    'x-circle': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    spinner: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    bot: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />,
    search: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
    clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
    inbox: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />,
    'chevron-down': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />,
    'chevron-left': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />,
    'chevron-right': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />,
    document: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
    scanner: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m-3.3 3.3l.7.7m6.5 0l-.7-.7M4 12h1m15 0h1m-3.3 3.3l.7.7m-8.6 0l.7-.7M8 12a4 4 0 118 0 4 4 0 01-8 0z" />,
    tag: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.659A2.25 2.25 0 009.568 3z" />
        <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      </>
    ),
    save: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-4-4H8z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v4h10V4M10 20v-6h4v6" />
      </>
    ),
    menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />,
    'file-text': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    'file-spreadsheet': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    'bar-chart-2': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10m-4 10V4m-4 10V6m-4 10v4" />,
    'edit-3': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9m-9-4h6m-13.414.586l11.293-11.293a1 1 0 011.414 0l1.414 1.414a1 1 0 010 1.414l-11.293 11.293a1 1 0 01-.707.293H7v-2.293a1 1 0 01.293-.707z" />,
    'user-plus': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m14-10a4 4 0 11-8 0 4 4 0 018 0m4 5V9m3 3h-6" />,
    'trash-2': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2m-6 9h4m-4-4h4" />,
    'alert-circle': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    loader: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />,
    'arrow-left': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />,
    'arrow-right': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H6" />,
    banking: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M3 10h18M5 10V7l7-4 7 4v3M9 21v-5a1 1 0 011-1h4a1 1 0 011 1v5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 13h2m6 0h2" opacity={0.5} />
      </>
    ),
    refresh: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    link: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    'skip-forward': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4l10 8-10 8V4zm14 0v16" />,
    info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    eye: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
      </>
    ),
    'eye-off': (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.73 5.08A3 3 0 1014.13 8.48" />
      </>
    ),
    'more-vertical': (
      <>
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      </>
    ),
    key: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L6.5 21H3v-3.5l10.257-10.257A6 6 0 1121 9z" />
      </>
    ),
    slash: (
      <>
        <circle cx="12" cy="12" r="10" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.93 4.93l14.14 14.14" />
      </>
    ),
    location: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />,

  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      className={combinedClassName}
      style={combinedStyle}
    >
      {icons[name]}
    </svg>
  );
};

export default Icon;
