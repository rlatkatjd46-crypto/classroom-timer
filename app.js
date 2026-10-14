/**
 * 교실 TV용 활동 타이머 (Classroom Activity Timer)
 * - 정확한 시간 계산 (Date.now 기반 drift 방지)
 * - Web Audio API 기반 무설치 학교 차임벨 합성음
 * - 1분 미만 색상 변경 및 종료 시 화면 깜빡임 + 안내 문구
 */

class ClassroomTimer {
  constructor() {
    // 상태 변수
    this.initialTotalSeconds = 5 * 60; // 기본 5분
    this.remainingSeconds = this.initialTotalSeconds;
    this.isRunning = false;
    this.timerInterval = null;
    this.targetEndTime = null;
    this.soundEnabled = true;

    // Web Audio Context
    this.audioCtx = null;
    this.alarmLoopInterval = null;

    // DOM 요소 캐싱
    this.dom = {
      body: document.body,
      appContainer: document.getElementById('appContainer'),
      timeMinutes: document.getElementById('timeMinutes'),
      timeSeconds: document.getElementById('timeSeconds'),
      progressBar: document.getElementById('progressBar'),
      timesUpBanner: document.getElementById('timesUpBanner'),
      startPauseBtn: document.getElementById('startPauseBtn'),
      startPauseText: document.getElementById('startPauseText'),
      resetBtn: document.getElementById('resetBtn'),
      presetBtns: document.querySelectorAll('.preset-btn[data-minutes]'),
      customMinutes: document.getElementById('customMinutes'),
      applyCustomBtn: document.getElementById('applyCustomBtn'),
      add1MinBtn: document.getElementById('add1MinBtn'),
      sub1MinBtn: document.getElementById('sub1MinBtn'),
      soundToggleBtn: document.getElementById('soundToggleBtn'),
      soundIcon: document.getElementById('soundIcon'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      activityTitle: document.getElementById('activityTitle')
    };

    this.init();
  }

  init() {
    this.renderTime();
    this.updateProgressBar();
    this.bindEvents();
  }

  bindEvents() {
    // 시작 / 일시정지 버튼
    this.dom.startPauseBtn.addEventListener('click', () => this.toggleStartPause());

    // 초기화 버튼
    this.dom.resetBtn.addEventListener('click', () => this.reset());

    // 프리셋 버튼들 (5분, 10분, 15분)
    this.dom.presetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const minutes = parseInt(btn.dataset.minutes, 10);
        this.setTimerMinutes(minutes);
        this.setActivePreset(btn);
      });
    });

    // 직접 입력 적용
    this.dom.applyCustomBtn.addEventListener('click', () => this.applyCustomInput());
    this.dom.customMinutes.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.applyCustomInput();
      }
    });

    // +1분 / -1분
    this.dom.add1MinBtn.addEventListener('click', () => this.adjustTime(60));
    this.dom.sub1MinBtn.addEventListener('click', () => this.adjustTime(-60));

    // 사운드 토글
    this.dom.soundToggleBtn.addEventListener('click', () => this.toggleSound());

    // 전체화면 토글
    this.dom.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    // 종료 배너 클릭 시 알람 끄기 및 초기화 편의 기능
    this.dom.timesUpBanner.addEventListener('click', () => {
      this.stopAlarmSound();
      this.reset();
    });

    // 키보드 단축키
    window.addEventListener('keydown', (e) => {
      // 제목이나 입력창 입력 중일 때는 단축키 무시
      if (document.activeElement === this.dom.customMinutes || 
          document.activeElement === this.dom.activityTitle) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleStartPause();
      } else if (e.key.toLowerCase() === 'r') {
        this.reset();
      } else if (e.key.toLowerCase() === 'f') {
        this.toggleFullscreen();
      }
    });
  }

  setActivePreset(targetBtn) {
    this.dom.presetBtns.forEach(b => b.classList.remove('active'));
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
  }

  setTimerMinutes(minutes) {
    if (isNaN(minutes) || minutes <= 0) return;
    this.pause();
    this.stopAlarmSound();
    this.initialTotalSeconds = minutes * 60;
    this.remainingSeconds = this.initialTotalSeconds;
    this.clearAlertStates();
    this.checkThresholdStates();
    this.renderTime();
    this.updateProgressBar();
  }

  applyCustomInput() {
    const val = parseInt(this.dom.customMinutes.value, 10);
    if (!val || val <= 0) {
      alert('1분 이상의 숫자를 입력해주세요.');
      return;
    }
    this.setTimerMinutes(val);
    this.setActivePreset(null);
  }

  adjustTime(deltaSeconds) {
    if (this.dom.body.classList.contains('state-timeup')) {
      this.clearAlertStates();
      this.stopAlarmSound();
    }

    this.remainingSeconds = Math.max(10, this.remainingSeconds + deltaSeconds);
    if (this.isRunning) {
      this.targetEndTime = Date.now() + this.remainingSeconds * 1000;
    } else {
      if (this.remainingSeconds > this.initialTotalSeconds) {
        this.initialTotalSeconds = this.remainingSeconds;
      }
    }
    this.checkThresholdStates();
    this.renderTime();
    this.updateProgressBar();
  }

  toggleStartPause() {
    // 오디오 컨텍스트 사용자 제스처 활성화
    this.ensureAudioContext();

    if (this.dom.body.classList.contains('state-timeup')) {
      this.reset();
      return;
    }

    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = this.initialTotalSeconds;
    }
    this.isRunning = true;
    this.targetEndTime = Date.now() + this.remainingSeconds * 1000;

    // UI 버튼 상태
    this.dom.startPauseBtn.classList.add('btn-pause');
    this.dom.startPauseText.textContent = '일시정지';
    this.dom.startPauseBtn.querySelector('.btn-icon').textContent = '⏸';

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tick(), 200);
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.timerInterval);

    // 잔여 시간 갱신
    const now = Date.now();
    this.remainingSeconds = Math.max(0, Math.round((this.targetEndTime - now) / 1000));

    // UI 버튼 상태
    this.dom.startPauseBtn.classList.remove('btn-pause');
    this.dom.startPauseText.textContent = '계속';
    this.dom.startPauseBtn.querySelector('.btn-icon').textContent = '▶';
  }

  reset() {
    this.pause();
    this.stopAlarmSound();
    this.remainingSeconds = this.initialTotalSeconds;
    this.clearAlertStates();
    this.renderTime();
    this.updateProgressBar();

    this.dom.startPauseText.textContent = '시작';
    this.dom.startPauseBtn.querySelector('.btn-icon').textContent = '▶';
  }

  tick() {
    const now = Date.now();
    const diff = Math.max(0, Math.round((this.targetEndTime - now) / 1000));

    if (diff !== this.remainingSeconds) {
      this.remainingSeconds = diff;
      this.renderTime();
      this.updateProgressBar();
      this.checkThresholdStates();

      if (this.remainingSeconds <= 0) {
        this.timeUp();
      }
    }
  }

  checkThresholdStates() {
    // 1분 이하 (60초 이하) 경고 상태
    if (this.remainingSeconds > 0 && this.remainingSeconds <= 60) {
      this.dom.body.classList.add('state-warning');
    } else {
      this.dom.body.classList.remove('state-warning');
    }
  }

  clearAlertStates() {
    this.dom.body.classList.remove('state-warning');
    this.dom.body.classList.remove('state-timeup');
  }

  timeUp() {
    clearInterval(this.timerInterval);
    this.isRunning = false;
    this.remainingSeconds = 0;
    this.renderTime();
    this.updateProgressBar();

    // 깜빡임 화면 효과 및 문구 노출
    this.dom.body.classList.remove('state-warning');
    this.dom.body.classList.add('state-timeup');

    // UI 버튼 재설정
    this.dom.startPauseBtn.classList.remove('btn-pause');
    this.dom.startPauseText.textContent = '다시 시작';
    this.dom.startPauseBtn.querySelector('.btn-icon').textContent = '↺';

    // 종료 사운드 재생
    this.playTimeUpChime();
  }

  renderTime() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    this.dom.timeMinutes.textContent = String(mins).padStart(2, '0');
    this.dom.timeSeconds.textContent = String(secs).padStart(2, '0');

    // 브라우저 탭 타이틀에도 시간 표시
    document.title = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} - 교실 타이머`;
  }

  updateProgressBar() {
    const ratio = this.initialTotalSeconds > 0 ? (this.remainingSeconds / this.initialTotalSeconds) : 0;
    const percentage = Math.max(0, Math.min(100, ratio * 100));
    this.dom.progressBar.style.width = `${percentage}%`;
  }

  // ----------------- 오디오 사운드 시스템 (Web Audio API) -----------------
  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (this.soundEnabled) {
      this.dom.soundIcon.textContent = '🔔';
      this.dom.soundToggleBtn.classList.remove('muted');
      this.playNote(523.25, 0.15, 0.1); // 도
    } else {
      this.dom.soundIcon.textContent = '🔕';
      this.dom.soundToggleBtn.classList.add('muted');
      this.stopAlarmSound();
    }
  }

  playNote(frequency, duration, volume = 0.3, type = 'sine') {
    if (!this.soundEnabled) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  playTimeUpChime() {
    if (!this.soundEnabled) return;
    this.ensureAudioContext();

    // 학교 종소리 (웨스트민스터 딩동댕동 차임벨) 멜로디
    // 미(E4: 329.63), 도(C4: 261.63), 레(D4: 293.66), 솔(G3: 196.00) 등
    const chimeNotes = [
      { f: 659.25, d: 0.6, t: 0.0 }, // E5
      { f: 523.25, d: 0.6, t: 0.4 }, // C5
      { f: 587.33, d: 0.6, t: 0.8 }, // D5
      { f: 392.00, d: 0.9, t: 1.2 }, // G4
      { f: 523.25, d: 0.6, t: 1.8 }, // C5
      { f: 587.33, d: 0.6, t: 2.2 }, // D5
      { f: 659.25, d: 0.6, t: 2.6 }, // E5
      { f: 523.25, d: 1.2, t: 3.0 }  // C5
    ];

    const playChimeSequence = () => {
      chimeNotes.forEach(note => {
        setTimeout(() => {
          if (this.dom.body.classList.contains('state-timeup')) {
            this.playNote(note.f, note.d, 0.45, 'triangle');
          }
        }, note.t * 1000);
      });
    };

    // 1회 즉시 재생
    playChimeSequence();

    // 5초 간격으로 반복 (교실에서 모두가 인지할 수 있도록)
    clearInterval(this.alarmLoopInterval);
    this.alarmLoopInterval = setInterval(() => {
      if (this.dom.body.classList.contains('state-timeup')) {
        playChimeSequence();
      } else {
        this.stopAlarmSound();
      }
    }, 4500);
  }

  stopAlarmSound() {
    if (this.alarmLoopInterval) {
      clearInterval(this.alarmLoopInterval);
      this.alarmLoopInterval = null;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`전체화면 오류: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
}

// DOM 로드 완료 시 인스턴스 시작
document.addEventListener('DOMContentLoaded', () => {
  window.classroomTimer = new ClassroomTimer();
});
