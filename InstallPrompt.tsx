import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Share, PlusSquare } from 'lucide-react';

interface InstallPromptProps {
  lang: 'ar' | 'en';
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({ lang }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // default to true so it doesn't flash

  useEffect(() => {
    // Check if user has already dismissed or installed
    const hasPrompted = localStorage.getItem('hasPromptedInstall');
    
    // Check if running in standalone mode (already installed)
    const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(_isStandalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const _isIOS = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(_isIOS);

    if (!_isStandalone && !hasPrompted) {
      // For Android/Chrome
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      });

      // For iOS, show after a short delay since there is no beforeinstallprompt event
      if (_isIOS) {
        setTimeout(() => {
          setShowPrompt(true);
        }, 2000);
      }
    }
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
    }
    closePrompt();
  };

  const closePrompt = () => {
    setShowPrompt(false);
    localStorage.setItem('hasPromptedInstall', 'true');
  };

  if (!showPrompt) return null;

  const isRtl = lang === 'ar';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border-2 border-[#0e9594]/20 p-4 z-[100]"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <button 
          onClick={closePrompt}
          className="absolute top-2 ltr:right-2 rtl:left-2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
            <img src="/icon.svg" alt="App Icon" className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">
              {lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}
            </h3>
            
            {isIOS ? (
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p>{lang === 'ar' ? 'لتثبيت التطبيق على جهازك:' : 'To install this app on your device:'}</p>
                <ol className="list-decimal ltr:ml-4 rtl:mr-4 space-y-1">
                  <li>{lang === 'ar' ? 'اضغط على زر المشاركة' : 'Tap the Share button'} <Share className="w-4 h-4 inline" /></li>
                  <li>{lang === 'ar' ? 'اختر "إضافة إلى الصفحة الرئيسية"' : 'Select "Add to Home Screen"'} <PlusSquare className="w-4 h-4 inline" /></li>
                </ol>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  {lang === 'ar' ? 'أضف التطبيق إلى شاشتك الرئيسية لسهولة الوصول.' : 'Add the app to your home screen for easy access.'}
                </p>
                <button 
                  onClick={handleInstall}
                  className="w-full bg-[#0e9594] hover:bg-[#0b7a79] text-white font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {lang === 'ar' ? 'تثبيت الآن' : 'Install Now'}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
