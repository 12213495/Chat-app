// ================= User identity =================
// Each browser tab gets its own name, color and id, so two tabs act like two different people
let myName = sessionStorage.getItem('chatName');
let myColor = sessionStorage.getItem('chatColor') || '#00a884';

let myId = sessionStorage.getItem('chatId');
if (!myId) {
  myId = Math.random().toString(36).slice(2);
  sessionStorage.setItem('chatId', myId);
}

// ================= Socket connection =================
let counter = 0;

const socket = io({
  auth: {
    serverOffset: 0
  },
  ackTimeout: 10000,
  retries: 3,
});

// ================= Page elements =================
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const attach = document.getElementById('attach');
const fileInput = document.getElementById('file');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');

// ================= Welcome screen =================
const welcome = document.getElementById('welcome');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const avatarPreview = document.getElementById('avatarPreview');
const colorOptions = document.querySelectorAll('.color-option');
const userAvatar = document.getElementById('userAvatar');
const userNameLabel = document.getElementById('userName');
const leaveBtn = document.getElementById('leaveBtn');

function firstLetter(name) {
  return name ? name.trim().charAt(0).toUpperCase() : '?';
}

const LOGO_SVG = `
  <svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
    <path d="M16 20a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H30l-9 8v-8h-1a6 6 0 0 1-4-6z" fill="#fff"/>
    <circle cx="24" cy="27" r="2.8" fill="currentColor"/>
    <circle cx="32" cy="27" r="2.8" fill="currentColor"/>
    <circle cx="40" cy="27" r="2.8" fill="currentColor"/>
  </svg>`;

function updatePreview() {
  const name = nameInput.value.trim();
  if (name) {
    // Typing: show the first letter
    avatarPreview.textContent = firstLetter(name);
    avatarPreview.style.color = '#fff';
  } else {
    // Empty: show the logo, with dots in the chosen color
    avatarPreview.innerHTML = LOGO_SVG;
    avatarPreview.style.color = myColor;
  }
  avatarPreview.style.background = myColor;
}

function enterChat() {
  userAvatar.textContent = firstLetter(myName);
  userAvatar.style.background = myColor;
  userNameLabel.textContent = myName;
  welcome.classList.add('hidden');
  window.scrollTo(0, document.body.scrollHeight);
}

// Live avatar preview while typing the name
nameInput.addEventListener('input', () => {
  avatarPreview.classList.remove('bounce');
  void avatarPreview.offsetWidth;   // restart the animation
  avatarPreview.classList.add('bounce');
  updatePreview();
});

// Pick a color
colorOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    colorOptions.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    myColor = btn.dataset.color;
    updatePreview();
  });
});

// Join
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.classList.remove('shake');
    void nameInput.offsetWidth;
    nameInput.classList.add('shake');
    nameInput.focus();
    return;
  }
  myName = name;
  sessionStorage.setItem('chatName', myName);
  sessionStorage.setItem('chatColor', myColor);
  enterChat();
  input.focus();
});

// Leave
leaveBtn.addEventListener('click', () => {
  sessionStorage.removeItem('chatName');
  location.reload();
});

// Start: skip the welcome screen if this tab already joined
if (myName) {
  nameInput.value = myName;
  colorOptions.forEach((b) => b.classList.toggle('selected', b.dataset.color === myColor));
  updatePreview();
  enterChat();
} else {
  updatePreview();
  nameInput.focus();
}

// ================= Sending =================
function sendPayload(data) {
  const clientOffset = `${socket.id}-${counter++}`;
  socket.emit(
    'chat message',
    JSON.stringify({ id: myId, name: myName, color: myColor, ...data }),
    clientOffset
  );
}

// Text messages
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value) {
    sendPayload({ text: input.value });
    input.value = '';
  }
});

// ================= Emoji picker =================
emojiPanel.addEventListener('emoji-click', (e) => {
  input.value += e.detail.unicode;
  input.focus();
});

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  emojiPanel.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target)) emojiPanel.classList.remove('open');
});

// ================= Image from gallery =================
attach.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    return;
  }

  // Shrink the image first so it is small enough to send and store
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    const MAX = 800;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    sendPayload({ image: canvas.toDataURL('image/jpeg', 0.7) });
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Could not read that image.');
  };

  img.src = url;
});

// ================= Live camera =================
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('video');
const preview = document.getElementById('preview');
const shutter = document.getElementById('shutter');
const camClose = document.getElementById('camClose');
const camSwitch = document.getElementById('camSwitch');
const camRetake = document.getElementById('camRetake');
const camSend = document.getElementById('camSend');

let stream = null;
let facing = 'user';   // 'user' = front camera, 'environment' = back camera
let captured = null;

function stopStream() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

async function startStream() {
  stopStream();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    closeCamera();
    alert('Could not open the camera. Please allow camera permission and make sure no other app is using it.');
  }
}

function showLive() {
  captured = null;
  preview.hidden = true;
  video.hidden = false;
  shutter.hidden = false;
  camSwitch.hidden = false;
  camRetake.hidden = true;
  camSend.hidden = true;
}

function showPreview() {
  preview.src = captured;
  preview.hidden = false;
  video.hidden = true;
  shutter.hidden = true;
  camSwitch.hidden = true;
  camRetake.hidden = false;
  camSend.hidden = false;
}

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('The camera only works on https:// links or on localhost. Open the app using localhost or your deployed https link.');
    return;
  }
  showLive();
  cameraModal.classList.add('open');
  await startStream();
}

function closeCamera() {
  stopStream();
  captured = null;
  cameraModal.classList.remove('open');
}

document.getElementById('cameraBtn').addEventListener('click', openCamera);
camClose.addEventListener('click', closeCamera);

camSwitch.addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  await startStream();
});

shutter.addEventListener('click', () => {
  if (!video.videoWidth) return;
  const MAX = 800;
  const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  captured = canvas.toDataURL('image/jpeg', 0.7);
  showPreview();
});

camRetake.addEventListener('click', showLive);

camSend.addEventListener('click', () => {
  if (captured) sendPayload({ image: captured });
  closeCamera();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cameraModal.classList.contains('open')) closeCamera();
});

// ================= Receiving =================
socket.on('chat message', (msg, serverOffset) => {
  const item = document.createElement('li');

  let data;
  try { data = JSON.parse(msg); } catch (e) { data = null; }

  if (data && (data.text || data.image)) {
    item.className = data.id === myId ? 'mine' : 'other';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = data.id === myId ? 'You' : data.name;
    // Show the sender's chosen color (only accept a plain hex color)
    if (/^#[0-9a-fA-F]{6}$/.test(data.color || '')) {
      name.style.color = data.color;
    }
    item.appendChild(name);

    if (data.text) {
      const text = document.createElement('span');
      text.textContent = data.text;
      item.appendChild(text);
    }

    if (data.image && String(data.image).startsWith('data:image/')) {
      const pic = document.createElement('img');
      pic.src = data.image;
      pic.alt = 'image';
      pic.addEventListener('load', () => window.scrollTo(0, document.body.scrollHeight));
      item.appendChild(pic);
    }
  } else {
    // old messages saved before this change
    item.className = 'old';
    item.textContent = msg;
  }

  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
  socket.auth.serverOffset = serverOffset;
});