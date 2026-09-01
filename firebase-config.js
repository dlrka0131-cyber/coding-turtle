// ⚠️ 아래 firebaseConfig 값을 본인의 Firebase 프로젝트 설정 값으로 바꿔주세요!
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 에서 복사할 수 있어요.
const firebaseConfig = {
  apiKey: "AIzaSyAhg3BDuDCz-AfRtS87De1hv8gfZgzmCv8",
  authDomain: "turtle-coding.firebaseapp.com",
  projectId: "turtle-coding",
  storageBucket: "turtle-coding.firebasestorage.app",
  messagingSenderId: "198857698614",
  appId: "1:198857698614:web:d9efa609440752a848d797"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 학생은 "이름"만으로 로그인하지만, Firebase Auth는 이메일 형식이 필요해서
// 내부적으로 이름을 가짜 이메일 주소로 변환해서 사용해요.
// (학교/학년은 로그인 키에는 안 쓰고, 기록용 프로필 정보로만 저장해요.)
const FAKE_EMAIL_DOMAIN = '@turtle-coding.local';

function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/\s+/g, '_');
  return clean + FAKE_EMAIL_DOMAIN;
}

// 회원가입(최초 1회): 학교 + 학년 + 이름 + 비밀번호를 받아서 계정을 만들어요.
async function signUpStudent(school, grade, username, password) {
  const email = usernameToEmail(username);
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await db.collection('students').doc(cred.user.uid).set({
    school: school.trim(),
    grade: grade.trim(),
    username: username.trim(),
    progress: {}
  });
  return cred.user;
}

// 로그인(이후 접속): 이름 + 비밀번호만으로 로그인해요.
async function logInStudent(username, password) {
  const email = usernameToEmail(username);
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

function logOutStudent() {
  return auth.signOut();
}

// 로그인 상태가 바뀔 때마다 호출되는 콜백을 등록해요.
function onAuthChange(callback) {
  auth.onAuthStateChanged(callback);
}

// 특정 차시를 완료 처리해서 Firestore에 저장해요.
async function markChapterComplete(chapterNum) {
  const user = auth.currentUser;
  if (!user) return;
  await db.collection('students').doc(user.uid).set({
    progress: { [String(chapterNum)]: true }
  }, { merge: true });
}

// 로그인한 학생의 진행 기록을 Firestore에서 가져와요.
async function getStudentProgress() {
  const user = auth.currentUser;
  if (!user) return {};
  const doc = await db.collection('students').doc(user.uid).get();
  return doc.exists ? (doc.data().progress || {}) : {};
}

// 로그인한 학생의 표시 이름(학년 + 이름)을 가져와요.
async function getStudentName() {
  const user = auth.currentUser;
  if (!user) return null;
  const doc = await db.collection('students').doc(user.uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const grade = data.grade || '';
  const username = data.username || '학생';
  return (grade + ' ' + username).trim();
}

// ---------- 선생님-학생 편지함 ----------
// 선생님 전용 계정의 로그인 이메일이에요. (usernameToEmail("admin") 결과와 같아요)
const TEACHER_EMAIL = 'admin' + FAKE_EMAIL_DOMAIN;

function isTeacher(user) {
  return !!user && user.email === TEACHER_EMAIL;
}

// 학생이 선생님께 편지를 써서 보내요.
async function sendLetterToTeacher(text) {
  const user = auth.currentUser;
  if (!user) return;
  await db.collection('students').doc(user.uid).set({
    letters: firebase.firestore.FieldValue.arrayUnion({ text: text.trim(), createdAt: new Date().toISOString() })
  }, { merge: true });
}

// 로그인한 학생에게 아직 확인하지 않은 선생님 메시지가 있으면 가져와요.
async function getUnreadTeacherMessage() {
  const user = auth.currentUser;
  if (!user) return null;
  const doc = await db.collection('students').doc(user.uid).get();
  if (!doc.exists) return null;
  const msg = doc.data().teacherMessage;
  return (msg && !msg.read) ? msg : null;
}

// 학생이 선생님 메시지를 확인했다고 표시해요.
async function markTeacherMessageRead() {
  const user = auth.currentUser;
  if (!user) return;
  const doc = await db.collection('students').doc(user.uid).get();
  if (!doc.exists) return;
  const msg = doc.data().teacherMessage;
  if (!msg) return;
  await db.collection('students').doc(user.uid).set({
    teacherMessage: Object.assign({}, msg, { read: true })
  }, { merge: true });
}

// (관리자 전용) 모든 학생의 기록을 가져와요.
async function getAllStudents() {
  const snap = await db.collection('students').get();
  return snap.docs.map(function (doc) {
    return Object.assign({ uid: doc.id }, doc.data());
  });
}

// (관리자 전용) 특정 학생에게 메시지를 보내요.
async function sendMessageToStudent(uid, text) {
  await db.collection('students').doc(uid).set({
    teacherMessage: { text: text.trim(), createdAt: new Date().toISOString(), read: false }
  }, { merge: true });
}

// (관리자 전용) 더 이상 관리하지 않는 학생의 기록을 삭제해요.
// 참고: 이 사이트는 백엔드(Admin SDK)가 없어서 로그인 계정 자체는 지울 수 없고,
// Firestore에 저장된 기록(이름/진도/편지/메시지)만 지워져요. 같은 이름으로 다시 로그인하면
// 새 학생처럼 빈 기록으로 다시 시작돼요.
async function deleteStudent(uid) {
  await db.collection('students').doc(uid).delete();
}
