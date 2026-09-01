(function(){
  const boardEl = document.getElementById('board');
  const messageEl = document.getElementById('message');
  const turnLabel = document.getElementById('turnLabel');
  const scoreEl = document.getElementById('score');
  const resetBtn = document.getElementById('resetBtn');

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  let board = Array(9).fill(null);
  let current = 'X';
  let gameOver = false;
  let scores = { X:0, O:0, DRAW:0 };

  function renderScore(){
    scoreEl.textContent = `X:${scores.X} O:${scores.O} DRAW:${scores.DRAW}`;
  }

  function buildBoard(){
    boardEl.innerHTML = '';
    board.forEach((val, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.addEventListener('click', onCellClick);
      boardEl.appendChild(cell);
    });
  }

  function onCellClick(e){
    if(gameOver) return;
    const idx = Number(e.currentTarget.dataset.index);
    if(board[idx]) return;

    board[idx] = current;
    const cellEl = boardEl.children[idx];
    cellEl.textContent = current;
    cellEl.classList.add(current.toLowerCase(), 'taken', 'pop');

    messageEl.classList.remove('blink');

    const result = checkWin();
    if(result){
      gameOver = true;
      highlightWin(result.line);
      scores[current]++;
      renderScore();
      messageEl.textContent = `PLAYER ${current} WINS!`;
      messageEl.classList.add('blink');
      turnLabel.textContent = 'GAME OVER';
      return;
    }

    if(board.every(c => c)){
      gameOver = true;
      scores.DRAW++;
      renderScore();
      messageEl.textContent = 'DRAW GAME';
      messageEl.classList.add('blink');
      turnLabel.textContent = 'GAME OVER';
      return;
    }

    current = current === 'X' ? 'O' : 'X';
    turnLabel.textContent = `P${current === 'X' ? '1' : '2'} TURN: ${current}`;
    messageEl.textContent = `${current}'S TURN`;
  }

  function checkWin(){
    for(const line of WIN_LINES){
      const [a,b,c] = line;
      if(board[a] && board[a] === board[b] && board[a] === board[c]){
        return { winner: board[a], line };
      }
    }
    return null;
  }

  function highlightWin(line){
    line.forEach(i => boardEl.children[i].classList.add('win'));
  }

  function resetGame(){
    board = Array(9).fill(null);
    current = 'X';
    gameOver = false;
    buildBoard();
    turnLabel.textContent = 'P1 TURN: X';
    messageEl.textContent = 'PRESS A CELL TO START';
    messageEl.classList.add('blink');
  }

  resetBtn.addEventListener('click', resetGame);

  buildBoard();
  renderScore();
})();
