import React, { useState, useEffect } from 'react';
import { Joyride, STATUS, type Step, type EventData } from 'react-joyride';

interface TutorialProps {
  lang: 'ar' | 'en';
  activeStep: string;
}

export const Tutorial: React.FC<TutorialProps> = ({ lang, activeStep }) => {
  const [runProjectsTour, setRunProjectsTour] = useState(false);
  const [runListTour, setRunListTour] = useState(false);

  useEffect(() => {
    const hasSeenProjectsTour = localStorage.getItem('projectsTourCompleted_v5');
    if (!hasSeenProjectsTour && activeStep === 'projects') {
      // Small delay to ensure DOM is ready
      setTimeout(() => setRunProjectsTour(true), 500);
    }
    
    const hasSeenListTour = localStorage.getItem('listTourCompleted_v5');
    if (!hasSeenListTour && activeStep === 'list') {
      setTimeout(() => setRunListTour(true), 500);
    }
  }, [activeStep]);

  const handleProjectsCallback = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunProjectsTour(false);
      localStorage.setItem('projectsTourCompleted_v5', 'true');
    }
  };

  const handleListCallback = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunListTour(false);
      localStorage.setItem('listTourCompleted_v5', 'true');
    }
  };

  const isRtl = lang === 'ar';

  const projectsSteps: Step[] = [
    {
      target: '#btn-new-project',
      content: lang === 'ar' ? 'ابدأ بإضافة قسم (كاتيجوري) جديد لترتيب الأدوية الخاصة بك.' : 'Start by adding a new category to organize your medicines.',
      
      placement: 'bottom', skipBeacon: true,
    },
    {
      target: '#btn-database',
      content: lang === 'ar' ? 'تحديث قاعدة بيانات الأدوية للبحث.' : 'Update the reference database for search.',
      placement: 'bottom', skipBeacon: true,
    }, {
      target: '#projects-list-container',
      content: lang === 'ar' ? 'للحذف اسحب من اليسار لليمين، وللتعديل اسحب من اليمين لليسار.' : 'To delete swipe left to right, to edit swipe right to left.',
      placement: 'top', skipBeacon: true,
    }];

  const listSteps: Step[] = [
    {
      target: '#btn-scan-camera',
      content: lang === 'ar' ? 'التقط صورة لعلبة الدواء لإضافته مع استخراج التواريخ والتفاصيل تلقائياً.' : 'Take a photo of the medicine box to add it and extract dates and details automatically.',
      
      placement: 'bottom', skipBeacon: true,
    },
    {
      target: '#btn-scan-barcode',
      content: lang === 'ar' ? 'أو امسح الباركود الخاص بالدواء للوصول السريع للمعلومات وإضافتها.' : 'Or scan the medicine barcode for quick access to add information.',
      placement: 'bottom', skipBeacon: true,
    },
    
    {
      target: '#btn-category-title',
      content: lang === 'ar' ? 'للرجوع للقائمة الرئيسية في أي وقت، اضغط على اسم الكاتيجوري هنا.' : 'To return to the main menu at any time, tap the category name here.',
      placement: 'bottom', skipBeacon: true,
    }
  , {
      target: '#btn-manual',
      content: lang === 'ar' ? 'أو إضافة الدواء يدوياً.' : 'Or add medicine manually.',
      placement: 'bottom', skipBeacon: true,
    }, {
      target: '#medicines-list-container',
      content: lang === 'ar' ? 'للحذف اسحب من اليسار لليمين، وللتعديل اسحب من اليمين لليسار.' : 'To delete swipe left to right, to edit swipe right to left.',
      placement: 'top', skipBeacon: true,
    }];

  const commonStyles = {
    options: {
      primaryColor: '#0e9594',
      zIndex: 1000,
      arrowColor: '#ffffff',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
    },
    buttonNext: {
      backgroundColor: '#0e9594',
      borderRadius: '12px',
      padding: '12px 24px',
      fontFamily: 'inherit',
      fontWeight: 'bold',
    },
    buttonBack: {
      marginRight: 10,
      color: '#64748b',
      fontFamily: 'inherit',
    },
    buttonSkip: {
      color: '#64748b',
      fontFamily: 'inherit',
    },
    tooltipContainer: {
      fontFamily: 'inherit',
      textAlign: isRtl ? 'right' : 'left',
    },
    tooltipContent: {
      padding: '20px 10px',
      fontSize: '16px',
      fontWeight: '500',
    }
  };

  const locale = {
    last: lang === 'ar' ? 'إنهاء' : 'Finish',
    next: lang === 'ar' ? 'التالي' : 'Next',
    skip: lang === 'ar' ? 'تخطي' : 'Skip',
    back: lang === 'ar' ? 'السابق' : 'Back',
  };

  return (
    <>
      {activeStep === 'projects' && (
        <Joyride continuous
          key="projects-tour"
          steps={projectsSteps}
          run={runProjectsTour}
          
          
          
          
          onEvent={handleProjectsCallback}
          styles={commonStyles as any}
          locale={locale}
        />
      )}
      
      {activeStep === 'list' && (
        <Joyride continuous
          key="list-tour"
          steps={listSteps}
          run={runListTour}
          
          
          
          
          onEvent={handleListCallback}
          styles={commonStyles as any}
          locale={locale}
        />
      )}
    </>
  );
};
