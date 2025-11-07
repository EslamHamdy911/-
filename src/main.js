// Phaser 3 Memory Match with WebAudio tones and responsive behavior
class SoundManager {
  constructor(){
    try{
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }catch(e){
      this.ctx = null;
    }
  }
  playTone(freq = 440, duration = 0.08, type = 'sine', gain = 0.12){
    if(!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }
  click(){ this.playTone(700,0.06,'sine',0.08); }
  match(){ this.playTone(880,0.12,'triangle',0.12); this.playTone(660,0.12,'sine',0.06); }
  win(){ this.playTone(880,0.12,'sine',0.16); this.playTone(1100,0.18,'sine',0.14); }
}

class PreloadScene extends Phaser.Scene {
  constructor(){ super('PreloadScene'); }
  preload(){}
  create(){
    // generate card textures dynamically (no external assets needed)
    const colors = [0xf94144,0xf3722c,0xf8961e,0xf9c74f,0x90be6d,0x43aa8b,0x577590,0x277da1];
    for(let i=0;i<8;i++){
      const g = this.make.graphics({x:0,y:0,add:false});
      g.fillStyle(colors[i],1);
      g.fillRoundedRect(0,0,140,200,12);
      g.lineStyle(4,0xffffff,0.06);
      g.strokeRoundedRect(0,0,140,200,12);
      const txt = this.add.text(70,100, String(i+1), {font:'64px Arial', color:'#ffffff'}).setOrigin(0.5).setShadow(2,2,'#000',2);
      const rt = this.add.renderTexture(0,0,140,200).setVisible(false);
      rt.draw(g);
      rt.draw(txt,70,100);
      rt.saveTexture('card'+(i+1));
      rt.destroy();
      txt.destroy();
      g.destroy();
    }
    // card back
    const gb = this.make.graphics({add:false});
    gb.fillStyle(0x22223b,1);
    gb.fillRoundedRect(0,0,140,200,12);
    gb.lineStyle(4,0xffffff,0.06);
    gb.strokeRoundedRect(0,0,140,200,12);
    this.textures.draw('cardBack', gb, 0,0);
    const rt2 = this.add.renderTexture(0,0,140,200).setVisible(false);
    const tb = this.add.text(70,100,'?', {font:'48px Arial', color:'#ffffff'}).setOrigin(0.5);
    rt2.draw(gb);
    rt2.draw(tb,70,100);
    rt2.saveTexture('cardBack');
    rt2.destroy();
    tb.destroy();
    gb.destroy();

    // small delay then go to menu
    this.time.delayedCall(150, ()=> this.scene.start('MenuScene'));
  }
}

class MenuScene extends Phaser.Scene{
  constructor(){ super('MenuScene'); }
  create(){
    this.soundMgr = this.game.soundMgr;
    const { width, height } = this.scale;
    this.add.text(width/2, 120, 'لعبة الذاكرة', { font: '40px Arial', color:'#ffffff' }).setOrigin(0.5);
    this.add.text(width/2, 180, 'طابق البطاقات بأقل عدد من الحركات', { font: '18px Arial', color:'#cccccc' }).setOrigin(0.5);
    const html = `<div class="phaser-dom-input" style="text-align:center">
      <button class="phaser-btn">ابدأ اللعبة</button>
    </div>`;
    const btn = this.add.dom(width/2, 260).createFromHTML(html);
    btn.addListener('click');
    btn.on('click', () => {
      // resume audio context on user interaction for mobile autoplay policies
      if(this.soundMgr && this.soundMgr.ctx && this.soundMgr.ctx.state === 'suspended'){
        this.soundMgr.ctx.resume();
      }
      this.soundMgr && this.soundMgr.click();
      this.scene.start('GameScene');
    });
    const best = localStorage.getItem('memory_best_moves');
    this.add.text(width/2, 320, best ? `أفضل نتيجة: ${best} حركات` : 'لم يلعب بعد', { font: '16px Arial', color:'#ddd' }).setOrigin(0.5);
    // small tip
    this.add.text(width/2, height-80, 'نصيحة: اضغط على أي بطاقة للكشف. تدعم اللمس والماوس.', { font:'14px Arial', color:'#888' }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene{
  constructor(){ super('GameScene'); }
  create(){
    this.soundMgr = this.game.soundMgr;
    this.moves = 0;
    this.matches = 0;
    this.flipped = [];
    const { width, height } = this.scale;
    this.createHUD();
    // prepare deck: 8 pairs -> 16 cards
    const fronts = [];
    for(let i=1;i<=8;i++) fronts.push('card'+i);
    const deck = Phaser.Utils.Array.Shuffle(fronts.concat(fronts));
    // grid layout adapted to available width: try 4x4 or fallback
    const cols = 4;
    const rows = 4;
    const cardW = Math.min(140, Math.floor((width - 80 - (cols-1)*12)/cols));
    const cardH = Math.floor(cardW * (200/140));
    const spacing = 12;
    const totalW = cols*cardW + (cols-1)*spacing;
    const startX = (width - totalW)/2 + cardW/2;
    const startY = 120 + cardH/2;
    this.cards = [];
    let idx = 0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = startX + c*(cardW+spacing);
        const y = startY + r*(cardH+spacing);
        const frontKey = deck[idx++];
        const card = this.add.sprite(x,y,'cardBack').setInteractive();
        card.displayWidth = cardW; card.displayHeight = cardH;
        card.frontKey = frontKey;
        card.isFlipped = false;
        card.isMatched = false;
        card.on('pointerdown', () => this.onCardClicked(card));
        this.cards.push(card);
      }
    }
    // handle keyboard restart for desktop
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
  }

  createHUD(){
    const { width } = this.scale;
    this.movesText = this.add.text(20,20, `الحركات: ${this.moves}`, { font:'20px Arial', color:'#fff' });
    this.bestText = this.add.text(width-20,20, `أفضل: -`, { font:'20px Arial', color:'#fff' }).setOrigin(1,0);
    const best = localStorage.getItem('memory_best_moves');
    if(best) this.bestText.setText(`أفضل: ${best}`);
    // restart button
    const restart = this.add.text(width-20,60, 'إعادة', { font:'18px Arial', color:'#00aaff' }).setOrigin(1,0).setInteractive();
    restart.on('pointerdown', ()=> {
      this.soundMgr && this.soundMgr.click();
      this.scene.restart();
    });
  }

  onCardClicked(card){
    if(card.isFlipped || card.isMatched) return;
    if(this.flipped.length >=2) return;
    this.flipCard(card, true);
    this.soundMgr && this.soundMgr.click();
    this.flipped.push(card);
    if(this.flipped.length === 2){
      this.moves++;
      this.movesText.setText(`الحركات: ${this.moves}`);
      const [a,b] = this.flipped;
      if(a.frontKey === b.frontKey){
        // match
        a.isMatched = b.isMatched = true;
        this.soundMgr && this.soundMgr.match();
        this.time.delayedCall(300, ()=> {
          this.tweens.add({
            targets: [a,b],
            scale: { from:1, to:1.04 },
            duration: 180,
            yoyo:true
          });
        });
        this.matches++;
        this.flipped = [];
        if(this.matches === 8){
          this.time.delayedCall(450, ()=> this.onWin());
        }
      } else {
        // not match -> flip back
        this.time.delayedCall(700, ()=> {
          this.flipCard(a, false);
          this.flipCard(b, false);
          this.flipped = [];
        });
      }
    }
  }

  flipCard(card, showFront){
    // flip animation using scaleX
    this.tweens.add({
      targets: card,
      scaleX: 0,
      duration: 120,
      onComplete: ()=>{
        if(showFront) card.setTexture(card.frontKey);
        else card.setTexture('cardBack');
        this.tweens.add({
          targets: card,
          scaleX: 1,
          duration: 120
        });
      }
    });
    card.isFlipped = showFront;
  }

  onWin(){
    this.soundMgr && this.soundMgr.win();
    const best = localStorage.getItem('memory_best_moves');
    if(!best || this.moves < parseInt(best,10)){
      localStorage.setItem('memory_best_moves', String(this.moves));
      this.bestText.setText(`أفضل: ${this.moves}`);
    }
    // show simple win panel
    const { width, height } = this.scale;
    const panel = this.add.rectangle(width/2,height/2,420,220,0x101018,0.95).setStrokeStyle(2,0xffffff,0.06).setDepth(50);
    const txt = this.add.text(width/2, height/2 - 30, `مبروك! فزت بـ ${this.moves} حركات`, { font:'22px Arial', color:'#fff' }).setOrigin(0.5).setDepth(51);
    const btn = this.add.text(width/2, height/2 + 40, 'إعادة اللعب', { font:'18px Arial', color:'#00aaff' }).setOrigin(0.5).setInteractive().setDepth(51);
    btn.on('pointerdown', ()=> this.scene.restart());
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 900,
  height: 720,
  backgroundColor: 0x0b0b12,
  scene: [PreloadScene, MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

window.onload = () => {
  const game = new Phaser.Game(config);
  // attach a simple SoundManager used by scenes
  game.soundMgr = new SoundManager();
  // add container styling class
  const canvasEl = document.querySelector('#game-container');
  canvasEl.classList.add('canvas-container');
};
