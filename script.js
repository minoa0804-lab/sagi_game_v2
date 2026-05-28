// ゲーム状態管理
const gameState = {
    currentScreen: 'title', // title, game, result
    score: 0,
    callCount: 0,
    totalCalls: 15,
    correctCount: 0,
    combo: 0,
    maxCombo: 0,
    currentData: null,
    allData: [],
    questionQueue: [],
    difficulty: 'normal',
    responseTime: 0,
    line2DisplayTime: 0,
    actionStartTime: 0,
    canAnswer: false,
    line2TimeoutId: null,
    line2IntervalId: null,
    nextCallTimeoutId: null,
};

// 効果音
const sounds = {
    call: new Audio('call.mp3'),
    correctAnswer: new Audio('correct_answer.mp3'),
    wrongAnswer: new Audio('wrong_answer.mp3'),
    ending: new Audio('ending.mp3')
};

// 音量設定
Object.values(sounds).forEach(sound => {
    sound.volume = 0.5;
});

// 難易度設定
const difficultySettings = {
    easy: {
        totalCalls: 15,
        fraudRatio: 0.7,  // 詐欺70%、普通30%
        scoringRules: {
            fraud: {
                correct: {
                    fast: { threshold: 2.4, points: 8 },
                    medium: { threshold: 3.0, points: 6 },
                    normal: { threshold: 3.8, points: 3 },
                    slow: { threshold: Infinity, points: 1 }
                },
                incorrect: -8
            },
            normal: {
                correct: {
                    fast: { threshold: 2.6, points: 5 },
                    medium: { threshold: 3.3, points: 3 },
                    normal: { threshold: 4.3, points: 2 },
                    slow: { threshold: Infinity, points: 1 }
                },
                incorrect: -2
            }
        },
        rankThresholds: { S: 80, A: 60, B: 40, C: 20 }
    },
    normal: {
        totalCalls: 15,
        fraudRatio: 0.625,  // 詐欺62.5%、普通37.5%
        scoringRules: {
            fraud: {
                correct: {
                    fast: { threshold: 1.6, points: 10 },
                    medium: { threshold: 2.2, points: 7 },
                    normal: { threshold: 3.0, points: 4 },
                    slow: { threshold: Infinity, points: 1 }
                },
                incorrect: -10
            },
            normal: {
                correct: {
                    fast: { threshold: 1.8, points: 6 },
                    medium: { threshold: 2.5, points: 4 },
                    normal: { threshold: 3.5, points: 2 },
                    slow: { threshold: Infinity, points: 1 }
                },
                incorrect: -3
            }
        },
        rankThresholds: { S: 120, A: 90, B: 60, C: 30 }
    },
    hard: {
        totalCalls: 15,
        fraudRatio: 0.5,  // 詐欺50%、普通50%
        scoringRules: {
            fraud: {
                correct: {
                    fast: { threshold: 1.2, points: 12 },
                    medium: { threshold: 1.8, points: 9 },
                    normal: { threshold: 2.4, points: 6 },
                    slow: { threshold: Infinity, points: 2 }
                },
                incorrect: -12
            },
            normal: {
                correct: {
                    fast: { threshold: 1.4, points: 8 },
                    medium: { threshold: 2.0, points: 6 },
                    normal: { threshold: 2.8, points: 3 },
                    slow: { threshold: Infinity, points: 1 }
                },
                incorrect: -5
            }
        },
        rankThresholds: { S: 180, A: 140, B: 100, C: 60 }
    }
};

// スコアリング設定（デフォルト）
const scoringRules = difficultySettings.normal.scoringRules;

// UI要素の取得
const titleScreen = document.getElementById('titleScreen');
const gameScreen = document.getElementById('gameScreen');
const resultScreen = document.getElementById('resultScreen');
const startButton = document.getElementById('startButton');
const acceptButton = document.getElementById('acceptButton');
const cutButton = document.getElementById('cutButton');
const restartButton = document.getElementById('restartButton');
const line1Element = document.getElementById('line1');
const line2Element = document.getElementById('line2');
const scoreValue = document.getElementById('scoreValue');
const callCountElement = document.getElementById('callCount');
const resultMessage = document.getElementById('resultMessage');
const comboDisplay = document.getElementById('comboDisplay');

// イベントリスナー設定
startButton.addEventListener('click', startGame);
acceptButton.addEventListener('click', () => playerAction('accept'));
cutButton.addEventListener('click', () => playerAction('cut'));
restartButton.addEventListener('click', restartGame);

// 難易度ボタンのイベントリスナー
document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // 選択状態を更新
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        
        // 難易度を設定
        gameState.difficulty = e.target.dataset.difficulty;
    });
});

// CSVをパースする（カンマ区切り、ダブルクォートに対応）
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

function validateCallData(row, rowNumber) {
    const [id, category, line1, line2, correct_action] = row;
    const validCategories = ['fraud', 'normal', 'other'];
    const validActions = ['cut', 'accept', 'either'];

    if (row.length !== 5) {
        throw new Error(`${rowNumber}行目: CSVの列数が不正です`);
    }

    if (!id || Number.isNaN(Number(id))) {
        throw new Error(`${rowNumber}行目: idが不正です`);
    }

    if (!validCategories.includes(category)) {
        throw new Error(`${rowNumber}行目: categoryが不正です`);
    }

    if (!line1 || !line2) {
        throw new Error(`${rowNumber}行目: 表示テキストが空です`);
    }

    if (!validActions.includes(correct_action)) {
        throw new Error(`${rowNumber}行目: correct_actionが不正です`);
    }

    return {
        id: Number(id),
        category,
        line1,
        line2,
        correct_action
    };
}

// CSVデータを読み込む
async function loadCSVData() {
    try {
        const response = await fetch('data.csv');
        if (!response.ok) {
            throw new Error(`data.csvの取得に失敗しました: ${response.status}`);
        }

        const text = await response.text();
        const lines = text.trim().split(/\r?\n/).filter(Boolean);

        if (lines.length < 2) {
            throw new Error('data.csvに問題データがありません');
        }

        gameState.allData = lines.slice(1).map((line, index) => {
            return validateCallData(parseCSVLine(line), index + 2);
        });

        const hasFraud = gameState.allData.some(d => d.category === 'fraud');
        const hasNormal = gameState.allData.some(d => d.category === 'normal');

        if (!hasFraud || !hasNormal) {
            throw new Error('data.csvにはfraudとnormalの両方が必要です');
        }
        
        console.log(`読み込み完了: ${gameState.allData.length}件のデータ`);
    } catch (error) {
        console.error('CSVデータの読み込みエラー:', error);
        // フォールバック: ブラウザ内にデータを持つ
        gameState.allData = getFallbackData();
    }
}

// フォールバックデータ（CSVが読み込めない場合）
function getFallbackData() {
    return [
        { id: 1, category: 'fraud', line1: 'もしもし、検察庁ですが。', line2: 'お客さんの口座の残高を確認させていただきたいのですが。', correct_action: 'cut' },
        { id: 2, category: 'fraud', line1: '警察の者ですが。', line2: '暗証番号を教えていただけますか？', correct_action: 'cut' },
        { id: 3, category: 'fraud', line1: 'ご実家のご両親様ですか？', line2: '実は息子さんが大変なことになってしまいまして、お金が必要なんです。', correct_action: 'cut' },
        { id: 4, category: 'fraud', line1: '銀行のセキュリティ部です。', line2: 'お客さんの口座が不正アクセスされています。すぐにATMでお金を引き出してください。', correct_action: 'cut' },
        { id: 5, category: 'normal', line1: 'こんにちは、新聞の定期購読についてお電話させていただいています。', line2: '今月の特別キャンペーンで、月々100円からご利用いただけます。どうですか？', correct_action: 'accept' },
        { id: 6, category: 'fraud', line1: '保健所からのお知らせです。', line2: 'お客さんの医療費の還付金が発生しました。銀行口座番号を教えてください。', correct_action: 'cut' },
        { id: 7, category: 'normal', line1: 'こちらはピザ屋さんのコールセンターです。', line2: '先日ご注文いただいたメニューについて、ご感想をお聞かせいただけますか？', correct_action: 'accept' },
        { id: 8, category: 'fraud', line1: 'こちらは通販の配送業者です。', line2: '荷物が返送されました。手数料を今すぐ支払ってください。', correct_action: 'cut' },
        { id: 9, category: 'normal', line1: 'こんにちは、ガス会社の定期点検センターです。', line2: '来月のご家庭のガス機器点検をご予約させていただきたいのですが、ご都合はつきますか？', correct_action: 'accept' },
        { id: 10, category: 'fraud', line1: '厚生労働省社会保険局です。', line2: '社会保険料の還付手続きが必要です。すぐにコンビニATMでお手続きください。', correct_action: 'cut' },
        { id: 11, category: 'normal', line1: 'こちらは携帯電話会社のカスタマーサポートセンターです。', line2: '今月のご利用料金について、ご不明な点はございますか？', correct_action: 'accept' },
        { id: 12, category: 'fraud', line1: '税務署からです。', line2: '過去の税金の追徴金が発生しました。すぐに支払わないと、ご自宅に差し押さえの手続きが進みます。', correct_action: 'cut' },
        { id: 13, category: 'fraud', line1: '警察本部生活安全課です。', line2: '犯罪被害の返金手続きがあります。個人情報を確認させていただきたいのですが。', correct_action: 'cut' },
        { id: 14, category: 'normal', line1: 'こんにちは、市役所の福祉事務所です。', line2: '来月の定期健康診断のご案内でお電話させていただきました。', correct_action: 'accept' },
        { id: 15, category: 'fraud', line1: '銀行のご本人確認担当です。', line2: 'セキュリティの確認のため、現在のお客さんの資産状況をお聞かせください。', correct_action: 'cut' }
    ];
}

function clearPendingTimers() {
    if (gameState.line2TimeoutId !== null) {
        clearTimeout(gameState.line2TimeoutId);
        gameState.line2TimeoutId = null;
    }

    if (gameState.line2IntervalId !== null) {
        clearInterval(gameState.line2IntervalId);
        gameState.line2IntervalId = null;
    }

    if (gameState.nextCallTimeoutId !== null) {
        clearTimeout(gameState.nextCallTimeoutId);
        gameState.nextCallTimeoutId = null;
    }
}

function setAnswerButtonsEnabled(enabled) {
    gameState.canAnswer = enabled;
    acceptButton.disabled = !enabled;
    cutButton.disabled = !enabled;
    acceptButton.style.opacity = enabled ? '1' : '0.5';
    cutButton.style.opacity = enabled ? '1' : '0.5';
}

function updateComboDisplay() {
    comboDisplay.textContent = `COMBO ${gameState.combo}`;
    comboDisplay.classList.toggle('combo-active', gameState.combo >= 2);
}

function getRankTitle(rank) {
    const titles = {
        S: '詐欺撃退マスター',
        A: '冷静な判定者',
        B: '見習い防犯員',
        C: '復習チャレンジャー',
        D: '要復習'
    };
    return titles[rank] || '要復習';
}

function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function buildQuestionQueue() {
    const settings = difficultySettings[gameState.difficulty];
    const fraudData = shuffleArray(gameState.allData.filter(d => d.category === 'fraud'));
    const normalData = shuffleArray(gameState.allData.filter(d => d.category === 'normal'));

    if (fraudData.length === 0 || normalData.length === 0) {
        gameState.questionQueue = shuffleArray(gameState.allData).slice(0, gameState.totalCalls);
        return;
    }

    const fraudCount = Math.min(
        fraudData.length,
        Math.round(settings.totalCalls * settings.fraudRatio)
    );
    const normalCount = Math.min(
        normalData.length,
        settings.totalCalls - fraudCount
    );

    let selected = [
        ...fraudData.slice(0, fraudCount),
        ...normalData.slice(0, normalCount)
    ];

    const selectedIds = new Set(selected.map(item => item.id));
    const remaining = shuffleArray(gameState.allData.filter(item => !selectedIds.has(item.id)));

    selected = selected.concat(remaining.slice(0, settings.totalCalls - selected.length));
    gameState.questionQueue = shuffleArray(selected);
}

// ゲーム開始
function startGame() {
    const settings = difficultySettings[gameState.difficulty];
    clearPendingTimers();
    
    gameState.score = 0;
    gameState.callCount = 0;
    gameState.correctCount = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.totalCalls = settings.totalCalls;
    gameState.fraudRatio = settings.fraudRatio;
    gameState.questionQueue = [];
    
    // 難易度に応じてスコアリング設定を更新
    Object.assign(scoringRules.fraud.correct, settings.scoringRules.fraud.correct);
    scoringRules.fraud.incorrect = settings.scoringRules.fraud.incorrect;
    Object.assign(scoringRules.normal.correct, settings.scoringRules.normal.correct);
    scoringRules.normal.incorrect = settings.scoringRules.normal.incorrect;
    buildQuestionQueue();
    gameState.totalCalls = gameState.questionQueue.length;
    updateComboDisplay();
    
    showScreen('game');
    nextCall();
}

// 次の電話へ
function nextCall() {
    clearPendingTimers();
    gameState.callCount++;
    
    if (gameState.callCount > gameState.totalCalls) {
        setAnswerButtonsEnabled(false);
        showScreen('result');
        displayResults();
        return;
    }
    
    gameState.currentData = gameState.questionQueue.shift();
    if (!gameState.currentData) {
        setAnswerButtonsEnabled(false);
        showScreen('result');
        displayResults();
        return;
    }
    
    // UI更新
    callCountElement.textContent = gameState.callCount;
    updateScore();
    updateComboDisplay();
    resultMessage.textContent = '';
    resultMessage.style.color = '#fff';
    
    // 1行目を表示
    line1Element.textContent = gameState.currentData.line1;
    line2Element.textContent = '';
    line2Element.style.opacity = '1';
    gameState.line2DisplayTime = 0;
    
    // 出題効果音を再生
    playSound('call');
    
    // 2行目が表示されるまで回答を受け付けない
    setAnswerButtonsEnabled(false);
    
    // 0.7秒後に2行目を一文字ずつ表示
    gameState.line2TimeoutId = setTimeout(() => {
        gameState.line2TimeoutId = null;
        displayLine2CharByChar(gameState.currentData.line2);
    }, 700);
}

// 2行目を一文字ずつ表示
function displayLine2CharByChar(text) {
    // 時間計測開始
    gameState.line2DisplayTime = Date.now();
    
    line2Element.textContent = '';
    let index = 0;
    const charInterval = 50; // ミリ秒（一文字ずつの間隔）

    setAnswerButtonsEnabled(true);
    
    gameState.line2IntervalId = setInterval(() => {
        if (index < text.length) {
            line2Element.textContent += text[index];
            index++;
        } else {
            clearInterval(gameState.line2IntervalId);
            gameState.line2IntervalId = null;
        }
    }, charInterval);
}

// プレイヤーのアクション
function playerAction(action) {
    if (!gameState.canAnswer || !gameState.currentData) {
        return;
    }

    // ボタン無効化（連続クリック防止）
    setAnswerButtonsEnabled(false);
    clearPendingTimers();
    
    // 反応時間を計測（2行目表示開始からの経過時間）
    gameState.responseTime = (Date.now() - gameState.line2DisplayTime) / 1000;
    
    // ボタンにビジュアルフィードバック
    if (action === 'accept') {
        acceptButton.style.opacity = '0.6';
        setTimeout(() => { acceptButton.style.opacity = gameState.canAnswer ? '1' : '0.5'; }, 200);
    } else {
        cutButton.style.opacity = '0.6';
        setTimeout(() => { cutButton.style.opacity = gameState.canAnswer ? '1' : '0.5'; }, 200);
    }
    
    // 判定とスコア計算
    judgeAnswer(action);
    
    // 次の電話へ
    gameState.nextCallTimeoutId = setTimeout(nextCall, 1500);
}

// 回答を判定
function judgeAnswer(action) {
    const data = gameState.currentData;
    let isCorrect = false;
    let points = 0;
    let messageText = '';
    let messageColor = '#ff0000';
    
    if (data.category === 'other') {
        // other: どちらでもOK
        isCorrect = true;
        points = 0;
        messageText = '➜ 適切な判断';
        messageColor = '#ffff00';
    } else if (data.category === 'fraud') {
        // 詐欺電話の判定
        if (action === data.correct_action) {
            isCorrect = true;
            points = calculatePoints(data.category, gameState.responseTime);
            messageText = '✓ 正解！素早く切りました！';
            messageColor = '#00ff00';
        } else {
            isCorrect = false;
            points = scoringRules.fraud.incorrect;
            messageText = '✗ 危険な電話でした！';
            messageColor = '#ff0000';
        }
    } else if (data.category === 'normal') {
        // 普通の電話の判定
        if (action === data.correct_action) {
            isCorrect = true;
            points = calculatePoints(data.category, gameState.responseTime);
            messageText = '✓ 正解！良い判断です';
            messageColor = '#00ff00';
        } else {
            isCorrect = false;
            points = scoringRules.normal.incorrect;
            messageText = '✗ 切ってしまいました';
            messageColor = '#ff0000';
        }
    }
    
    // スコア加算
    gameState.score += points;
    if (isCorrect && (data.category === 'fraud' || data.category === 'normal')) {
        gameState.correctCount++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
    } else if (!isCorrect) {
        gameState.combo = 0;
    }
    
    // メッセージ表示
    const comboText = isCorrect && gameState.combo >= 2 ? ` COMBO x${gameState.combo}` : '';
    resultMessage.textContent = `${messageText}${comboText}`;
    resultMessage.style.color = messageColor;
    updateComboDisplay();
    
    // 効果音フィードバック
    if (isCorrect) {
        playSound('correctAnswer');
    } else {
        playSound('wrongAnswer');
    }
}

// スコアポイント計算
function calculatePoints(category, responseTime) {
    const rules = scoringRules[category].correct;
    
    if (responseTime <= rules.fast.threshold) {
        return rules.fast.points;
    } else if (responseTime <= rules.medium.threshold) {
        return rules.medium.points;
    } else if (responseTime <= rules.normal.threshold) {
        return rules.normal.points;
    } else {
        return rules.slow.points;
    }
}

// スコア表示を更新
function updateScore() {
    const scoreStr = String(gameState.score).padStart(4, '0');
    scoreValue.textContent = scoreStr;
}

// 効果音を再生
function playSound(soundName) {
    try {
        if (sounds[soundName]) {
            // 音声を最初から再生
            sounds[soundName].currentTime = 0;
            sounds[soundName].play().catch(error => {
                console.log('音声再生エラー:', error);
            });
        }
    } catch (e) {
        console.log('効果音が利用できません:', e);
    }
}

// 結果を表示
function displayResults() {
    const totalQuestions = gameState.callCount - 1;
    const correctRate = totalQuestions > 0 ? Math.round((gameState.correctCount / totalQuestions) * 100) : 0;
    const rank = calculateRank(gameState.score);
    const rankTitle = getRankTitle(rank);
    
    document.getElementById('finalScore').textContent = String(gameState.score).padStart(4, '0');
    document.getElementById('rankValue').textContent = rank;
    document.getElementById('titleValue').textContent = rankTitle;
    document.getElementById('correctCount').textContent = gameState.correctCount;
    document.getElementById('totalCount').textContent = totalQuestions;
    document.getElementById('correctRate').textContent = correctRate;
    document.getElementById('maxCombo').textContent = gameState.maxCombo;
    
    // 結果発表効果音を再生
    playSound('ending');
    
    // 啓発メッセージを設定
    let educationMessage = '';
    if (rank === 'S' || rank === 'A') {
        educationMessage = '🎉 素晴らしい判断力です！\n詐欺を見分ける力が備わっています。\n\n⚠ 覚えておくこと：\n• 検察庁・警察は電話でお金を求めません\n• 銀行が暗証番号・口座情報を聞きません\n• 不安な電話は家族や警察に相談！\n\n【相談先】警察#9110 消費者庁188';
    } else if (rank === 'B') {
        educationMessage = '👍 良い結果です！\n何度もプレイすることで、\nもっと見分けやすくなります。\n\n💡 重要な詐欺ワード：\n• 「口座の残高」「暗証番号」\n• 「手数料」「すぐに」「ATMの操作」\n\n1つでも聞かれたら詐欺の可能性大！';
    } else {
        educationMessage = '📚 詐欺の手口を学びましょう！\n何度もプレイすることで、\n判断力が向上します。\n\n🚨 覚える詐欺ワード：\n• 「口座の残高」「暗証番号」\n• 「手数料」「緊急」「ATM」\n\n➜ 警察#9110 に相談！';
    }
    
    document.getElementById('educationMessage').textContent = educationMessage;
}

// ランク計算
function calculateRank(score) {
    const thresholds = difficultySettings[gameState.difficulty].rankThresholds;
    
    if (score >= thresholds.S) return 'S';
    if (score >= thresholds.A) return 'A';
    if (score >= thresholds.B) return 'B';
    if (score >= thresholds.C) return 'C';
    return 'D';
}

// 画面切り替え
function showScreen(screenName) {
    // すべての画面を非表示
    titleScreen.classList.remove('screen-active');
    gameScreen.classList.remove('screen-active');
    resultScreen.classList.remove('screen-active');
    
    // 指定された画面を表示
    if (screenName === 'title') {
        titleScreen.classList.add('screen-active');
    } else if (screenName === 'game') {
        gameScreen.classList.add('screen-active');
    } else if (screenName === 'result') {
        resultScreen.classList.add('screen-active');
    }
    
    gameState.currentScreen = screenName;
}

// ゲームをリスタート
function restartGame() {
    clearPendingTimers();
    showScreen('title');
    gameState.score = 0;
    gameState.callCount = 0;
    gameState.correctCount = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.currentData = null;
    setAnswerButtonsEnabled(false);
    updateComboDisplay();
    updateScore();
}

// 初期化
window.addEventListener('DOMContentLoaded', async () => {
    await loadCSVData();
    console.log('ゲーム初期化完了');
});
