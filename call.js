function loadPage() {
  console.log('on loadPage');

  $('#serverAddressText').val(localStorage.getItem('address'));
  $('#realmText').val(localStorage.getItem('realm'));
  $('#loginText').val(localStorage.getItem('login'));
  $('#passwordText').val(localStorage.getItem('pwd'));
  $('#callNumberText').val(localStorage.getItem('callNumber'));

  this._soundsControl = document.getElementById('sounds');
}

function login() {
  console.log('on login');
  this.serverAddressText = $('#serverAddressText');
  this.realmText = $('#realmText');
  this.loginText = $('#loginText');
  this.passwordText = $('#passwordText');
  this.loginButton = $('#loginButton');
  this.logOutButton = $('#logOutButton');

  this.callText = $('#callNumberText');
  this.callButton = $('#callNumberButton');
  this.answerButton = $('#answerButton');
  this.hangUpButton = $('#hangUpButton');

  localStorage.setItem('address', this.serverAddressText.val());
  localStorage.setItem('realm', this.realmText.val());
  localStorage.setItem('login', this.loginText.val());
  localStorage.setItem('pwd', this.passwordText.val());

  socket = new JsSIP.WebSocketInterface(this.serverAddressText.val());
  _ua = new JsSIP.UA({
    uri: 'sip:' + this.loginText.val() + '@' + this.realmText,
    password: this.passwordText.val(),
    display_name: this.loginText.val(),
    register: true,
    sockets: [socket],
  });

  // соединяемся с астером
  this._ua.on('connecting', () => {
    console.log('UA connecting');
  });

  // соединились с астером
  this._ua.on('connected', () => {
    console.log('UA connected');
  });

  // астер нас зарегал, теперь можно звонить и принимать звонки
  this._ua.on('registered', () => {
    console.log("UA registered");
    this.loginButton.prop('disabled', true);
    this.logOutButton.prop('disabled', false);
    this.serverAddressText.prop('disabled', true);
    this.realmText.prop('disabled', true);
    this.loginText.prop('disabled', true);
    this.passwordText.prop('disabled', true);

    this.callText.prop('disabled', false);
    this.callButton.prop('disabled', false);
    this.answerButton.prop('disabled', false);  
  });

  // астер про нас больше не знает
  this._ua.on('unregistered', () => {
    console.log('UA unregistered');
  });

  // астер не зарегал нас, что то не то, скорее всего неверный логин или пароль
  this._ua.on('registrationFailed', data => {
    console.error('UA registrationFailed', data.cause);
  });

  // заводим шарманку
  this._ua.start();
}

function logout() {
  console.log('on logout');

  this.loginButton.prop('disabled', false);
  this.logOutButton.prop('disabled', true);
  this.serverAddressText.prop('disabled', false);
  this.realmText.prop('disabled', false);
  this.loginText.prop('disabled', false);
  this.passwordText.prop('disabled', false);

  this.callText.prop('disabled', true);
  this.callButton.prop('disabled', true);
  this.answerButton.prop('disabled', true);
  this.hangUpButton.prop('disabled', true);
  

  // закрываем всё нафиг, вылогиниваемся из астера, закрываем коннект
  this._ua.stop();
}

function call() {
  let number = $('#callNumberText').val();
  localStorage.setItem('callNumber', number);

  this.callButton.prop('disabled', true);
  this.answerButton.prop('disabled', true);
  this.hangUpButton.prop('disabled', false);

  // Делаем ИСХОДЯЩИЙ звонок
  // Принимать звонки этот код не умеет!
  this.session = this._ua.call(number, {
    pcConfig: {
      hackStripTcp: true, // Важно для хрома, чтоб он не тупил при звонке
      rtcpMuxPolicy: 'negotiate', // Важно для хрома, чтоб работал multiplexing. Эту штуку обязательно нужно включить на астере.
      iceServers: [],
    },
    mediaConstraints: {
      audio: true, // Поддерживаем только аудио
      video: false,
    },
    rtcOfferConstraints: {
      offerToReceiveAudio: 1, // Принимаем только аудио
      offerToReceiveVideo: 0,
    },
  });

  // Это нужно для входящего звонка, пока не используем
  this._ua.on('newRTCSession', data => {
    if (!this._mounted) return;

    if (data.originator === 'local') return;

    // audioPlayer.play('ringing');
  });

  // Астер нас соединил с абонентом
  this.session.on('connecting', () => {
    console.log('UA session connecting');
    playSound('ringback.ogg', true);

    // Тут мы подключаемся к микрофону и цепляем к нему поток, который пойдёт в астер
    let peerconnection = this.session.connection;
    let localStream = peerconnection.getLocalStreams()[0];

    // Handle local stream
    if (localStream) {
      // Clone local stream
      this._localClonedStream = localStream.clone();

      console.log('UA set local stream');

      let localAudioControl = document.getElementById('localAudio');
      localAudioControl.srcObject = this._localClonedStream;
    }

    // Как только астер отдаст нам поток абонента, мы его засунем к себе в наушники
    peerconnection.addEventListener('addstream', event => {
      console.log('UA session addstream');

      let remoteAudioControl = document.getElementById('remoteAudio');
      remoteAudioControl.srcObject = event.stream;
    });
  });

  // В процессе дозвона
  this.session.on('progress', () => {
    console.log('UA session progress');
    playSound('ringback.ogg', true);
  });

  // Дозвон завершился неудачно, например, абонент сбросил звонок
  this.session.on('failed', data => {
    console.log('UA session failed');
    stopSound('ringback.ogg');
    playSound('rejected.mp3', false);

    this.callButton.prop('disabled', false);
    this.answerButton.prop('disabled', false);
    this.hangUpButton.prop('disabled', true);
  });

  // Поговорили, разбежались
  this.session.on('ended', () => {
    console.log('UA session ended');
    playSound('rejected.mp3', false);
    JsSIP.Utils.closeMediaStream(this._localClonedStream);

    this.callButton.prop('disabled', false);
    this.answerButton.prop('disabled', false);
    this.hangUpButton.prop('disabled', true);
  });

  // Звонок принят, моно начинать говорить
  this.session.on('accepted', () => {
    console.log('UA session accepted');
    stopSound('ringback.ogg');
    playSound('answered.mp3', false);
  });
}

function hangUp() {
  this.session.terminate();
  JsSIP.Utils.closeMediaStream(this._localClonedStream);
}

function playSound(soundName, loop) {
  this._soundsControl.pause();
  this._soundsControl.currentTime = 0.0;
  this._soundsControl.src = 'sounds/' + soundName;
  this._soundsControl.loop = loop;
  this._soundsControl.play();
}

function stopSound() {
  this._soundsControl.pause();
  this._soundsControl.currentTime = 0.0;
}
