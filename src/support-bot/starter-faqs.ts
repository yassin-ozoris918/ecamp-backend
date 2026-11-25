/**
 * Starter FAQ entries an admin can add with one click and then edit. They only describe how to use
 * the platform; none reveal how protection works or anything about other accounts.
 */
export interface StarterFaq {
  category: string;
  questionEn: string;
  questionAr: string;
  answerEn: string;
  answerAr: string;
  phrasings: string[];
  linkUrl?: string;
  linkLabelEn?: string;
  linkLabelAr?: string;
}

export const STARTER_FAQS: StarterFaq[] = [
  {
    category: 'Codes',
    questionEn: 'My activation code says "invalid". What should I do?',
    questionAr: 'كود التفعيل بيقول "غير صالح"، أعمل إيه؟',
    answerEn:
      'Please check these points:\n1. Copy and paste the code exactly as you received it (capital/small letters and spaces no longer matter).\n2. Enter it in the right place: a lecture code on that lecture, a course code on the course page, and a files code in the Files tab.\n3. Make sure the code is for your level (high school or university).\nIf it still does not work, contact support and send a clear photo of the code.',
    answerAr:
      'من فضلك اتأكد من النقاط دي:\n1. انسخ الكود والصقه زي ما وصلك بالظبط (الحروف الكبيرة والصغيرة والمسافات مبقتش تفرق).\n2. اكتبه في المكان الصح: كود المحاضرة جوه المحاضرة نفسها، كود الكورس في صفحة الكورس، وكود الملفات في تبويب الملفات.\n3. اتأكد إن الكود مخصص لمرحلتك (ثانوي أو جامعة).\nلو لسه مش شغال، كلم الدعم وابعت صورة واضحة للكود.',
    phrasings: [
      'code not working', 'invalid code', 'code is wrong', 'activation code error', 'code doesnt work',
      'الكود مش شغال', 'الكود غلط', 'كود غير صالح', 'الكود بيطلع خطأ', 'الكود مش راضي', 'el code msh shaghal', 'code mesh sha8al',
    ],
    linkUrl: '/contact',
    linkLabelEn: 'Contact support',
    linkLabelAr: 'تواصل مع الدعم',
  },
  {
    category: 'Codes',
    questionEn: 'The code says it was already used.',
    questionAr: 'الكود بيقول إنه مستخدم قبل كده.',
    answerEn:
      'Each code works only once. If you entered it before, the content is already unlocked: open My Courses and check. If you did not use it yourself, contact the place you got it from or contact support.',
    answerAr:
      'كل كود بيشتغل مرة واحدة بس. لو انت دخلته قبل كده، المحتوى مفتوح عندك بالفعل: افتح كورساتي واتأكد. لو انت ماستخدمتهوش، كلم المكان اللي اشتريته منه أو كلم الدعم.',
    phrasings: ['code already used', 'code already redeemed', 'used code', 'الكود مستخدم', 'الكود اتستخدم', 'مستخدم قبل كده'],
    linkUrl: '/dashboard',
    linkLabelEn: 'My courses',
    linkLabelAr: 'كورساتي',
  },
  {
    category: 'Codes',
    questionEn: 'How do I use an activation code?',
    questionAr: 'إزاي أستخدم كود التفعيل؟',
    answerEn:
      'Open the course or lecture you want, tap "Unlock" and paste your code. For a full course code use the course page; for a single lecture use that lecture; for files use the Files tab.',
    answerAr:
      'افتح الكورس أو المحاضرة اللي عايزها، اضغط "فتح" والصق الكود. كود الكورس الكامل في صفحة الكورس، كود المحاضرة جوه المحاضرة نفسها، وكود الملفات في تبويب الملفات.',
    phrasings: ['how to redeem code', 'where do i enter the code', 'activate code', 'ادخل الكود فين', 'افعل الكود ازاي', 'اشحن الكود', 'تفعيل الكود'],
  },
  {
    category: 'Account',
    questionEn: 'I can’t sign in from a new phone or laptop.',
    questionAr: 'مش عارف أدخل من موبايل أو لابتوب جديد.',
    answerEn:
      'Your account works on one device to protect the content. If you changed your device, contact support and ask them to reset your device. After that you can sign in from the new one.',
    answerAr:
      'حسابك بيشتغل على جهاز واحد لحماية المحتوى. لو غيرت جهازك، كلم الدعم واطلب إعادة تعيين الجهاز، وبعدها تقدر تدخل من الجهاز الجديد.',
    phrasings: ['new device', 'changed my phone', 'another device', 'device locked', 'جهاز جديد', 'غيرت الموبايل', 'جهاز تاني', 'الجهاز مقفول', 'مش عارف ادخل من جهاز'],
    linkUrl: '/contact',
    linkLabelEn: 'Contact support',
    linkLabelAr: 'تواصل مع الدعم',
  },
  {
    category: 'Account',
    questionEn: 'I forgot my password.',
    questionAr: 'نسيت كلمة السر.',
    answerEn: 'Contact support and they will set a new password for you. Never share your password with anyone, including in this chat.',
    answerAr: 'كلم الدعم وهيعملولك كلمة سر جديدة. ماتديش كلمة السر بتاعتك لأي حد، ولا حتى هنا في الشات.',
    phrasings: ['forgot password', 'reset password', 'cant remember password', 'نسيت الباسورد', 'نسيت كلمة المرور', 'الباسورد غلط'],
    linkUrl: '/contact',
    linkLabelEn: 'Contact support',
    linkLabelAr: 'تواصل مع الدعم',
  },
  {
    category: 'Account',
    questionEn: 'My account is waiting for approval.',
    questionAr: 'حسابي مستني الموافقة.',
    answerEn: 'New accounts are reviewed by the E.Camp team. You can sign in as soon as your details are approved.',
    answerAr: 'الحسابات الجديدة بيراجعها فريق E.Camp، وتقدر تدخل أول ما بياناتك تتأكد.',
    phrasings: ['account pending', 'waiting for approval', 'account under review', 'not approved', 'الحساب قيد المراجعة', 'مستني الموافقة', 'الحساب لسه متفعلش'],
  },
  {
    category: 'Account',
    questionEn: 'How do I change my name or phone number?',
    questionAr: 'إزاي أغير اسمي أو رقم موبايلي؟',
    answerEn: 'Open your Profile and send a change request. The team reviews it and updates your details.',
    answerAr: 'افتح صفحتك الشخصية وابعت طلب تعديل، والفريق هيراجعه ويحدث بياناتك.',
    phrasings: ['change name', 'change phone', 'edit profile', 'update my number', 'اغير الاسم', 'اغير رقم الموبايل', 'تعديل البيانات'],
    linkUrl: '/profile',
    linkLabelEn: 'Open my profile',
    linkLabelAr: 'صفحتي الشخصية',
  },
  {
    category: 'Videos',
    questionEn: 'The video doesn’t play or keeps loading.',
    questionAr: 'الفيديو مش بيشتغل أو فضل يحمل.',
    answerEn:
      'Try these steps: check your internet connection, refresh the page, turn off any VPN, and use the latest version of Chrome. If it still does not play, contact support with a screenshot of the message you see.',
    answerAr:
      'جرب الخطوات دي: اتأكد من النت، اعمل تحديث للصفحة، اقفل أي VPN، واستخدم آخر نسخة من كروم. لو لسه مش شغال، كلم الدعم وابعت صورة للرسالة اللي ظاهرة.',
    phrasings: ['video not playing', 'video not working', 'video loading', 'black screen', 'الفيديو مش شغال', 'الفيديو بيحمل', 'الفيديو واقف', 'شاشة سودا'],
    linkUrl: '/contact',
    linkLabelEn: 'Contact support',
    linkLabelAr: 'تواصل مع الدعم',
  },
  {
    category: 'Videos',
    questionEn: 'It says I have no views left for a video.',
    questionAr: 'بيقولي إن مشاهداتي للفيديو خلصت.',
    answerEn: 'Each video can be watched a limited number of times. If you need more views, contact support and they can review your request.',
    answerAr: 'كل فيديو ليه عدد مشاهدات محدود. لو محتاج مشاهدات زيادة، كلم الدعم وهيراجعوا طلبك.',
    phrasings: ['no views left', 'views finished', 'view limit', 'cant watch again', 'المشاهدات خلصت', 'عدد المشاهدات', 'مش عارف اشوف الفيديو تاني'],
    linkUrl: '/contact',
    linkLabelEn: 'Contact support',
    linkLabelAr: 'تواصل مع الدعم',
  },
  {
    category: 'Access',
    questionEn: 'My lecture access expired.',
    questionAr: 'صلاحية المحاضرة انتهت.',
    answerEn: 'Lecture access lasts for a set time after you start it. To open it again, use a new code or contact support.',
    answerAr: 'المحاضرة بتفضل مفتوحة لمدة محددة من أول ما تبدأها. عشان تفتحها تاني استخدم كود جديد أو كلم الدعم.',
    phrasings: ['access expired', 'lecture expired', 'lecture locked again', 'المحاضرة اتقفلت', 'المدة خلصت', 'انتهت المحاضرة', 'المحاضرة قفلت'],
  },
];
