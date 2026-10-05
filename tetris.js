/*
 * PROJECT: Game Menyusun Kata Aksara Jawa (Word Building Tetris Engine)
 * FILE: tetris.js
 * UPDATE: Murni menggunakan tetris.json tanpa data cadangan internal.
 */

function TetrisGame() {
    var self = this;

    // Konfigurasi 6 Kolom x 12 Baris
    this.unit = 40;     
    this.areaX = 6;     
    this.areaY = 12;    

    // State Permainan
    this.score = 0;
    this.level = 1;
    this.wordsFound = 0;
    this.paused = false;
    this.running = false;

    // Data Kata & Matriks Papan
    this.wordDatabase = [];
    this.targetWords = [];
    this.completedWords = new Set();
    this.grid = []; 

    // Balok Aktif
    this.currentBlock = null;
    this.nextAksara = '';
    this.fallTimer = null;
    this.speed = 1300; // 1.3 detik per petak

    // Web Audio Synthesizer
    this.audioCtx = null;

    this.init = function() {
        self.initBoardMatrix();
        self.loadWordDatabase();
        self.setupKeyListeners();
        self.setupTouchListeners();
    };

    this.initSound = function() {
        if (!self.audioCtx) {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) self.audioCtx = new AudioContext();
        }
    };

    this.playSound = function(type) {
        if (!self.audioCtx) return;
        try {
            var osc = self.audioCtx.createOscillator();
            var gain = self.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(self.audioCtx.destination);

            if (type === 'place') {
                osc.frequency.setValueAtTime(300, self.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, self.audioCtx.currentTime);
                osc.start();
                osc.stop(self.audioCtx.currentTime + 0.1);
            } else if (type === 'match') {
                osc.frequency.setValueAtTime(523.25, self.audioCtx.currentTime); 
                osc.frequency.exponentialRampToValueAtTime(659.25, self.audioCtx.currentTime + 0.3); 
                gain.gain.setValueAtTime(0.2, self.audioCtx.currentTime);
                osc.start();
                osc.stop(self.audioCtx.currentTime + 0.3);
            } else if (type === 'levelup') {
                osc.frequency.setValueAtTime(440, self.audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, self.audioCtx.currentTime + 0.5);
                gain.gain.setValueAtTime(0.25, self.audioCtx.currentTime);
                osc.start();
                osc.stop(self.audioCtx.currentTime + 0.5);
            }
        } catch (e) {}
    };

    this.initBoardMatrix = function() {
        self.grid = [];
        for (var r = 0; r < self.areaY; r++) {
            var row = [];
            for (var c = 0; c < self.areaX; c++) {
                row.push(null);
            }
            self.grid.push(row);
        }
    };

    // FUNGSI LOAD DATA: Murni dari tetris.json
    this.loadWordDatabase = function() {
        fetch('tetris.json')
            .then(function(res) { 
                if (!res.ok) throw new Error('Gagal memuat file tetris.json');
                return res.json(); 
            })
            .then(function(data) {
                self.wordDatabase = data;
                self.setupLevelTargetWords();
            })
            .catch(function(err) {
                console.error('Error:', err);
                alert('⚠️ Gagal memuat tetris.json!\nJalankan proyek menggunakan Web Server (Live Server, GitHub Pages, atau Vercel) agar file JSON dapat dibaca.');
            });
    };

    this.setupLevelTargetWords = function() {
        if (!self.wordDatabase || self.wordDatabase.length === 0) return;

        self.targetWords = self.wordDatabase.filter(function(item) {
            return item.level === self.level || item.level === ((self.level - 1) % 2) + 1;
        });

        if (self.targetWords.length === 0) {
            self.targetWords = self.wordDatabase.slice(0, 5);
        }

        self.renderTargetWordList();
    };

    this.renderTargetWordList = function() {
        var listEl = document.getElementById('target-word-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        self.targetWords.forEach(function(item) {
            var isDone = self.completedWords.has(item.latin.toLowerCase());
            var li = document.createElement('li');
            li.className = 'word-item' + (isDone ? ' completed' : '');
            
            var aksaraJoined = item.sukuKata ? item.sukuKata.join('') : item.latin;

            li.innerHTML = 
                '<span class="word-aksara">' + aksaraJoined + '</span>' +
                '<span class="status-icon">' + (isDone ? '✅' : '⏳') + '</span>';

            listEl.appendChild(li);
        });
    };

    this.getRandomAksaraSyllable = function() {
        var pool = [];

        if (self.targetWords && self.targetWords.length > 0) {
            self.targetWords.forEach(function(item) {
                var isDone = self.completedWords.has(item.latin.toLowerCase());
                if (!isDone && item.sukuKata && item.sukuKata.length > 0) {
                    pool = pool.concat(item.sukuKata);
                }
            });
        }

        if (pool.length === 0 && self.targetWords && self.targetWords.length > 0) {
            self.targetWords.forEach(function(item) {
                if (item.sukuKata) pool = pool.concat(item.sukuKata);
            });
        }

        return pool[Math.floor(Math.random() * pool.length)];
    };

    this.start = function() {
        self.initSound();
        self.reset();
        self.running = true;
        self.paused = false;
        self.nextAksara = self.getRandomAksaraSyllable();
        self.spawnBlock();
        self.runLoop();
    };

    this.reset = function() {
        if (self.fallTimer) clearTimeout(self.fallTimer);
        var area = document.getElementById('tetris-area');
        if (area) area.innerHTML = '';
        self.initBoardMatrix();
        self.score = 0;
        self.wordsFound = 0;
        self.level = 1;
        self.completedWords.clear();
        self.updateStatsUI();
        self.setupLevelTargetWords();
    };

    this.pause = function() {
        if (!self.running) return;
        self.paused = !self.paused;
        var pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) pauseBtn.innerText = self.paused ? '▶ Lanjutkan' : '⏸ Pause';
        if (!self.paused) self.runLoop();
    };

    this.spawnBlock = function() {
        var currentAksara = self.nextAksara || self.getRandomAksaraSyllable();
        self.nextAksara = self.getRandomAksaraSyllable();
        self.renderNextPreview();

        var startCol = 2;
        var startRow = 0;

        if (self.grid[startRow][startCol] !== null) {
            self.gameOver();
            return;
        }

        var area = document.getElementById('tetris-area');
        var el = document.createElement('div');
        el.className = 'block';
        el.innerText = currentAksara;
        
        if (currentAksara.length > 2) {
            el.style.fontSize = '0.8rem';
        }

        el.style.left = (startCol * self.unit) + 'px';
        el.style.top = (startRow * self.unit) + 'px';
        area.appendChild(el);

        self.currentBlock = {
            r: startRow,
            c: startCol,
            aksara: currentAksara,
            el: el
        };
    };

    this.renderNextPreview = function() {
        var box = document.getElementById('next-puzzle-box');
        if (!box) return;
        box.innerHTML = '';
        var div = document.createElement('div');
        div.className = 'block next';
        div.innerText = self.nextAksara;
        if (self.nextAksara.length > 2) {
            div.style.fontSize = '0.8rem';
        }
        box.appendChild(div);
    };

    this.runLoop = function() {
        if (self.fallTimer) clearTimeout(self.fallTimer);
        if (!self.running || self.paused) return;

        self.moveDown();
        self.speed = Math.max(500, 1300 - (self.level - 1) * 150);
        self.fallTimer = setTimeout(self.runLoop, self.speed);
    };

    this.moveLeft = function() {
        if (!self.currentBlock || self.paused) return;
        if (self.currentBlock.c > 0 && self.grid[self.currentBlock.r][self.currentBlock.c - 1] === null) {
            self.currentBlock.c--;
            self.updateBlockPos();
        }
    };

    this.moveRight = function() {
        if (!self.currentBlock || self.paused) return;
        if (self.currentBlock.c < self.areaX - 1 && self.grid[self.currentBlock.r][self.currentBlock.c + 1] === null) {
            self.currentBlock.c++;
            self.updateBlockPos();
        }
    };

    this.moveDown = function() {
        if (!self.currentBlock || self.paused) return;

        if (self.currentBlock.r + 1 < self.areaY && self.grid[self.currentBlock.r + 1][self.currentBlock.c] === null) {
            self.currentBlock.r++;
            self.updateBlockPos();
        } else {
            self.lockBlock();
        }
    };

    this.hardDrop = function() {
        if (!self.currentBlock || self.paused) return;
        while (self.currentBlock.r + 1 < self.areaY && self.grid[self.currentBlock.r + 1][self.currentBlock.c] === null) {
            self.currentBlock.r++;
        }
        self.updateBlockPos();
        self.lockBlock();
    };

    this.cycleAksara = function() {
        if (!self.currentBlock || self.paused) return;
        self.currentBlock.aksara = self.getRandomAksaraSyllable();
        self.currentBlock.el.innerText = self.currentBlock.aksara;
        if (self.currentBlock.aksara.length > 2) {
            self.currentBlock.el.style.fontSize = '0.8rem';
        } else {
            self.currentBlock.el.style.fontSize = '0.95rem';
        }
    };

    this.updateBlockPos = function() {
        if (!self.currentBlock) return;
        self.currentBlock.el.style.left = (self.currentBlock.c * self.unit) + 'px';
        self.currentBlock.el.style.top = (self.currentBlock.r * self.unit) + 'px';
    };

    this.lockBlock = function() {
        var r = self.currentBlock.r;
        var c = self.currentBlock.c;

        self.grid[r][c] = {
            aksara: self.currentBlock.aksara,
            el: self.currentBlock.el
        };

        self.playSound('place');
        self.currentBlock = null;

        self.checkWordMatches(function() {
            if (self.running) self.spawnBlock();
        });
    };

    this.checkWordMatches = function(callback) {
        var matchedCells = [];
        var matchedWords = [];

        for (var r = 0; r < self.areaY; r++) {
            var rowAksaraStr = '';
            var rowCells = [];
            for (var c = 0; c < self.areaX; c++) {
                if (self.grid[r][c] !== null) {
                    rowAksaraStr += self.grid[r][c].aksara;
                    rowCells.push({ r: r, c: c });
                } else {
                    self.evalAksaraSequence(rowAksaraStr, rowCells, matchedCells, matchedWords);
                    rowAksaraStr = '';
                    rowCells = [];
                }
            }
            self.evalAksaraSequence(rowAksaraStr, rowCells, matchedCells, matchedWords);
        }

        for (var c = 0; c < self.areaX; c++) {
            var colAksaraStr = '';
            var colCells = [];
            for (var r = 0; r < self.areaY; r++) {
                if (self.grid[r][c] !== null) {
                    colAksaraStr += self.grid[r][c].aksara;
                    colCells.push({ r: r, c: c });
                } else {
                    self.evalAksaraSequence(colAksaraStr, colCells, matchedCells, matchedWords);
                    colAksaraStr = '';
                    colCells = [];
                }
            }
            self.evalAksaraSequence(colAksaraStr, colCells, matchedCells, matchedWords);
        }

        if (matchedCells.length > 0) {
            self.playSound('match');
            self.highlightAndClearCells(matchedCells, matchedWords, callback);
        } else {
            if (callback) callback();
        }
    };

    this.evalAksaraSequence = function(aksaraStr, cellList, matchedCells, matchedWords) {
        if (!aksaraStr || cellList.length < 2) return;

        self.targetWords.forEach(function(item) {
            var targetAksara = item.sukuKata ? item.sukuKata.join('') : item.latin;

            if (aksaraStr.includes(targetAksara)) {
                matchedWords.push(item);
                self.completedWords.add(item.latin.toLowerCase());

                cellList.forEach(function(cell) {
                    matchedCells.push(cell);
                });
            }
        });
    };

    this.highlightAndClearCells = function(matchedCells, matchedWords, callback) {
        matchedCells.forEach(function(cell) {
            if (self.grid[cell.r][cell.c] && self.grid[cell.r][cell.c].el) {
                self.grid[cell.r][cell.c].el.classList.add('block-match');
            }
        });

        matchedWords.forEach(function(word) {
            self.score += 1000 * self.level;
            self.wordsFound++;
        });

        self.updateStatsUI();
        self.renderTargetWordList();

        setTimeout(function() {
            var area = document.getElementById('tetris-area');
            matchedCells.forEach(function(cell) {
                if (self.grid[cell.r][cell.c]) {
                    if (self.grid[cell.r][cell.c].el && area.contains(self.grid[cell.r][cell.c].el)) {
                        area.removeChild(self.grid[cell.r][cell.c].el);
                    }
                    self.grid[cell.r][cell.c] = null;
                }
            });

            self.applyGravity();

            if (self.completedWords.size >= self.targetWords.length) {
                self.levelUp();
                return; 
            }

            self.checkWordMatches(callback);

        }, 600);
    };

    this.applyGravity = function() {
        for (var c = 0; c < self.areaX; c++) {
            for (var r = self.areaY - 1; r >= 0; r--) {
                if (self.grid[r][c] === null) {
                    for (var k = r - 1; k >= 0; k--) {
                        if (self.grid[k][c] !== null) {
                            self.grid[r][c] = self.grid[k][c];
                            self.grid[k][c] = null;
                            self.grid[r][c].el.style.top = (r * self.unit) + 'px';
                            break;
                        }
                    }
                }
            }
        }
    };

    this.levelUp = function() {
        if (self.fallTimer) clearTimeout(self.fallTimer);
        self.playSound('levelup');
        self.level++;
        self.completedWords.clear();

        var area = document.getElementById('tetris-area');
        if (area) area.innerHTML = '';
        self.initBoardMatrix();

        self.setupLevelTargetWords();
        self.updateStatsUI();

        alert('🎉 SELAMAT! Anda berhasil menyelesaikan Level ' + (self.level - 1) + '! Lanjut ke Level ' + self.level);

        self.running = true;
        self.paused = false;
        self.nextAksara = self.getRandomAksaraSyllable();
        self.spawnBlock();
        self.runLoop();
    };

    this.gameOver = function() {
        self.running = false;
        if (self.fallTimer) clearTimeout(self.fallTimer);
        alert('GAME OVER!\nSkor Akhir Anda: ' + self.score + '\nKata Tertebak: ' + self.wordsFound);
    };

    this.updateStatsUI = function() {
        var scoreEl = document.getElementById('stat-score');
        var levelEl = document.getElementById('stat-level');
        var wordsEl = document.getElementById('stat-words');

        if (scoreEl) scoreEl.innerText = self.score;
        if (levelEl) levelEl.innerText = self.level;
        if (wordsEl) wordsEl.innerText = self.wordsFound;
    };

    this.setupKeyListeners = function() {
        document.addEventListener('keydown', function(e) {
            if (!self.running) return;
            if (e.keyCode === 37) { self.moveLeft(); e.preventDefault(); }
            else if (e.keyCode === 39) { self.moveRight(); e.preventDefault(); }
            else if (e.keyCode === 40) { self.moveDown(); e.preventDefault(); }
            else if (e.keyCode === 32) { self.hardDrop(); e.preventDefault(); }
            else if (e.keyCode === 38) { self.cycleAksara(); e.preventDefault(); }
            else if (e.keyCode === 80) { self.pause(); e.preventDefault(); }
        });
    };

    this.setupTouchListeners = function() {
        var btnLeft = document.getElementById('touch-left');
        var btnRight = document.getElementById('touch-right');
        var btnDown = document.getElementById('touch-down');
        var btnDrop = document.getElementById('touch-drop');
        var btnSwap = document.getElementById('touch-swap');

        function bindTouch(el, action) {
            if (!el) return;
            el.addEventListener('touchstart', function(e) {
                e.preventDefault();
                action();
            }, { passive: false });
            el.addEventListener('click', function(e) {
                e.preventDefault();
                action();
            });
        }

        bindTouch(btnLeft, function() { self.moveLeft(); });
        bindTouch(btnRight, function() { self.moveRight(); });
        bindTouch(btnDown, function() { self.moveDown(); });
        bindTouch(btnDrop, function() { self.hardDrop(); });
        bindTouch(btnSwap, function() { self.cycleAksara(); });

        var area = document.getElementById('tetris-area');
        if (!area) return;

        var startX = 0, startY = 0;
        var threshold = 20;

        area.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        }, { passive: true });

        area.addEventListener('touchend', function(e) {
            if (!startX || !startY || e.changedTouches.length === 0) return;
            var diffX = e.changedTouches[0].clientX - startX;
            var diffY = e.changedTouches[0].clientY - startY;

            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (Math.abs(diffX) > threshold) {
                    if (diffX > 0) self.moveRight();
                    else self.moveLeft();
                }
            } else {
                if (Math.abs(diffY) > threshold) {
                    if (diffY > 0) self.moveDown();
                    else self.cycleAksara();
                } else {
                    self.cycleAksara();
                }
            }
            startX = 0;
            startY = 0;
        }, { passive: true });
    };
}

var game = new TetrisGame();

window.onload = function() {
    game.init();

    document.getElementById('btn-start').onclick = function() { game.start(); };
    document.getElementById('btn-pause').onclick = function() { game.pause(); };
    document.getElementById('btn-reset').onclick = function() { game.reset(); };
    document.getElementById('btn-json').onclick = function() { openJsonModal(); };
    document.getElementById('btn-close-json').onclick = function() { closeJsonModal(); };
    document.getElementById('btn-save-json').onclick = function() { saveJsonModal(); };
    document.getElementById('btn-download-json').onclick = function() { downloadJsonFile(); };
};

function openJsonModal() {
    var modal = document.getElementById('json-modal');
    var textarea = document.getElementById('json-editor-textarea');
    if (modal && textarea) {
        textarea.value = JSON.stringify(game.wordDatabase || [], null, 2);
        modal.style.display = 'flex';
    }
}

function closeJsonModal() {
    var modal = document.getElementById('json-modal');
    if (modal) modal.style.display = 'none';
}

function saveJsonModal() {
    var textarea = document.getElementById('json-editor-textarea');
    try {
        var updatedData = JSON.parse(textarea.value);
        game.wordDatabase = updatedData;
        game.setupLevelTargetWords();
        alert('Target Kata Berhasil Diperbarui!');
        closeJsonModal();
    } catch (e) {
        alert('❌ Format JSON tidak valid! Periksa kembali sintaksis JSON.');
    }
}

function downloadJsonFile() {
    var textarea = document.getElementById('json-editor-textarea');
    var blob = new Blob([textarea.value], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tetris.json';
    a.click();
    URL.revokeObjectURL(url);
}
