// ========== AVALON TRADER DASHBOARD ==========
// Dashboard de Análise Técnica - Modo Simulação

(function() {
    'use strict';

    // ========== ESTADO GLOBAL ==========
    let candles = [];
    let currentPrice = 1.08542;
    let ma7 = [], ma20 = [], ma50 = [];
    let bbUpper = [], bbLower = [], bbMiddle = [];
    let rsi = 58.4;
    let trend = 'ALTA';
    let signal = 'FORTE COMPRA';
    let autoAnalysis = true;
    let showMA = true;
    let showBB = true;
    let soundEnabled = true;
    let currentTF = '1M';
    let candleCount = 60;
    let tickInterval = null;

    // ========== GERAR DADOS SIMULADOS ==========
    function generateCandles(count, startPrice) {
        let price = startPrice;
        const arr = [];
        const now = Date.now();
        for (let i = 0; i < count; i++) {
            const change = (Math.random() - 0.48) * 0.002;
            const open = price;
            price = price * (1 + change);
            const close = price;
            const high = Math.max(open, close) + Math.random() * 0.0005;
            const low = Math.min(open, close) - Math.random() * 0.0005;
            const volume = Math.floor(Math.random() * 1000 + 500);
            arr.push({
                time: now - (count - i) * 60000,
                open, high, low, close, volume
            });
        }
        return arr;
    }

    // ========== CÁLCULO DE INDICADORES ==========
    function calculateMA(data, period) {
        const ma = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { ma.push(null); continue; }
            let sum = 0;
            for (let j = 0; j < period; j++) sum += data[i - j].close;
            ma.push(sum / period);
        }
        return ma;
    }

    function calculateEMA(values, period) {
        const k = 2 / (period + 1);
        const ema = [values[0]];
        for (let i = 1; i < values.length; i++) {
            ema.push(values[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
    }

    function calculateBB(data, period, mult) {
        period = period || 20;
        mult = mult || 2;
        const middle = calculateMA(data, period);
        const upper = [], lower = [];
        for (let i = 0; i < data.length; i++) {
            if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
            let sumSq = 0;
            for (let j = 0; j < period; j++) {
                sumSq += Math.pow(data[i - j].close - middle[i], 2);
            }
            const std = Math.sqrt(sumSq / period);
            upper.push(middle[i] + mult * std);
            lower.push(middle[i] - mult * std);
        }
        return { upper, middle, lower };
    }

    function calculateRSI(data, period) {
        period = period || 14;
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = data[i].close - data[i - 1].close;
            if (change > 0) gains += change; else losses -= change;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        for (let i = period + 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
            avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
        }
        const rs = avgGain / (avgLoss || 0.001);
        return 100 - (100 / (1 + rs));
    }

    function calculateMACD(data) {
        const closes = data.map(c => c.close);
        const ema12 = calculateEMA(closes, 12);
        const ema26 = calculateEMA(closes, 26);
        const macdLine = ema12.map((v, i) => v - ema26[i]);
        const validMacd = macdLine.filter(v => v !== null && !isNaN(v));
        const signalLine = calculateEMA(validMacd, 9);
        const lastMacd = validMacd.slice(-1)[0] || 0;
        const lastSignal = signalLine.slice(-1)[0] || 0;
        return lastMacd > lastSignal ? 'COMPRA' : 'VENDA';
    }

    function calculateStochastic(data, k, d, smooth) {
        k = k || 14; d = d || 3; smooth = smooth || 3;
        const kValues = [];
        for (let i = k - 1; i < data.length; i++) {
            let lowest = Infinity, highest = -Infinity;
            for (let j = i - k + 1; j <= i; j++) {
                lowest = Math.min(lowest, data[j].low);
                highest = Math.max(highest, data[j].high);
            }
            const range = highest - lowest || 0.0001;
            kValues.push(((data[i].close - lowest) / range) * 100);
        }
        const lastK = kValues.slice(-1)[0] || 50;
        return lastK > 80 ? 'VENDA' : lastK < 20 ? 'COMPRA' : 'NEUTRO';
    }

    // ========== DESENHAR GRÁFICO ==========
    function drawChart() {
        const canvas = document.getElementById('candleCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;

        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, w, h);

        const pad = 40;
        const chartW = w - pad * 2;
        const chartH = h - pad * 2;

        const visible = candles.slice(-candleCount);
        if (visible.length === 0) return;

        const allPrices = visible.flatMap(c => [c.high, c.low]);
        if (showBB) {
            const bbU = bbUpper.slice(-candleCount);
            const bbL = bbLower.slice(-candleCount);
            bbU.forEach(v => { if (v !== null) allPrices.push(v); });
            bbL.forEach(v => { if (v !== null) allPrices.push(v); });
        }
        const minP = Math.min(...allPrices) * 0.9995;
        const maxP = Math.max(...allPrices) * 1.0005;
        const range = maxP - minP || 0.0001;

        const candleW = chartW / visible.length * 0.65;
        const gap = chartW / visible.length * 0.35;

        function y(p) { return pad + chartH - ((p - minP) / range) * chartH; }
        function x(i) { return pad + i * (chartW / visible.length) + gap / 2; }

        // Grid horizontal
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 5; i++) {
            const yy = pad + (chartH / 5) * i;
            ctx.beginPath(); ctx.moveTo(pad, yy); ctx.lineTo(w - pad, yy); ctx.stroke();
            const price = maxP - (range / 5) * i;
            ctx.fillStyle = '#8b949e';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(price.toFixed(5), pad - 4, yy + 3);
        }

        // Grid vertical
        for (let i = 0; i < visible.length; i += Math.ceil(visible.length / 8)) {
            const xx = x(i) + candleW / 2;
            ctx.strokeStyle = '#21262d';
            ctx.beginPath(); ctx.moveTo(xx, pad); ctx.lineTo(xx, h - pad); ctx.stroke();
        }

        // Bollinger Bands
        if (showBB) {
            const bbU = bbUpper.slice(-candleCount);
            const bbL = bbLower.slice(-candleCount);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            for (const band of [bbU, bbL]) {
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < band.length; i++) {
                    if (band[i] === null) continue;
                    const px = x(i) + candleW / 2;
                    const py = y(band[i]);
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        // Médias Móveis
        if (showMA) {
            const maData = [
                { arr: ma7.slice(-candleCount), color: '#58a6ff', width: 1.5 },
                { arr: ma20.slice(-candleCount), color: '#a371f7', width: 1.5 },
                { arr: ma50.slice(-candleCount), color: '#d29922', width: 1 }
            ];
            for (const ma of maData) {
                ctx.strokeStyle = ma.color;
                ctx.lineWidth = ma.width;
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < ma.arr.length; i++) {
                    if (ma.arr[i] === null) continue;
                    const px = x(i) + candleW / 2;
                    const py = y(ma.arr[i]);
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        }

        // Candles
        for (let i = 0; i < visible.length; i++) {
            const c = visible[i];
            const cx = x(i);
            const isUp = c.close >= c.open;
            const color = isUp ? '#2ea043' : '#f85149';
            const bodyTop = y(Math.max(c.open, c.close));
            const bodyBot = y(Math.min(c.open, c.close));
            const bodyH = Math.max(bodyBot - bodyTop, 1);

            // Wick
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + candleW / 2, y(c.high));
            ctx.lineTo(cx + candleW / 2, y(c.low));
            ctx.stroke();

            // Body
            ctx.fillStyle = color;
            ctx.fillRect(cx, bodyTop, candleW, bodyH);
        }

        // Linha de preço atual
        const lastC = visible[visible.length - 1];
        const cy = y(lastC.close);
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad, cy);
        ctx.lineTo(w - pad, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#58a6ff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lastC.close.toFixed(5), w - pad + 4, cy + 4);
    }

    // ========== ATUALIZAR INDICADORES NA UI ==========
    function updateIndicators() {
        ma7 = calculateMA(candles, 7);
        ma20 = calculateMA(candles, 20);
        ma50 = calculateMA(candles, 50);
        const bb = calculateBB(candles);
        bbUpper = bb.upper; bbLower = bb.lower; bbMiddle = bb.middle;

        rsi = calculateRSI(candles);
        const macdSig = calculateMACD(candles);
        const stochSig = calculateStochastic(candles);

        const lastMA7 = ma7.filter(v => v !== null).slice(-1)[0];
        const lastMA20 = ma20.filter(v => v !== null).slice(-1)[0];
        const lastMA50 = ma50.filter(v => v !== null).slice(-1)[0];
        const lastClose = candles[candles.length - 1].close;

        if (lastMA7 > lastMA20 && lastMA20 > lastMA50) trend = 'ALTA';
        else if (lastMA7 < lastMA20 && lastMA20 < lastMA50) trend = 'BAIXA';
        else trend = 'LATERAL';

        let buyCount = 0, sellCount = 0;
        if (macdSig === 'COMPRA') buyCount++; else sellCount++;
        if (stochSig === 'COMPRA') buyCount++;
        else if (stochSig === 'VENDA') sellCount++;
        if (rsi < 30) buyCount++;
        else if (rsi > 70) sellCount++;
        const lastBBU = bbUpper[bbUpper.length - 1] || 0;
        const lastBBL = bbLower[bbLower.length - 1] || Infinity;
        if (lastClose < lastBBL) buyCount++;
        else if (lastClose > lastBBU) sellCount++;

        if (buyCount >= 3 && trend === 'ALTA') signal = 'FORTE COMPRA';
        else if (buyCount >= 2) signal = 'COMPRA';
        else if (sellCount >= 3 && trend === 'BAIXA') signal = 'FORTE VENDA';
        else if (sellCount >= 2) signal = 'VENDA';
        else signal = 'AGUARDAR';

        // Atualizar DOM
        const currentPriceEl = document.getElementById('currentPrice');
        if (currentPriceEl) currentPriceEl.textContent = lastClose.toFixed(5);

        const change = ((lastClose - candles[candles.length - 2].close) / candles[candles.length - 2].close * 100);
        const changeEl = document.getElementById('priceChange');
        if (changeEl) {
            changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '% ' + (change >= 0 ? '▲' : '▼');
            changeEl.style.color = change >= 0 ? '#2ea043' : '#f85149';
        }

        const trendEl = document.getElementById('trendSignal');
        if (trendEl) {
            trendEl.textContent = trend;
            trendEl.className = 'card-value ' + (trend === 'ALTA' ? 'up' : trend === 'BAIXA' ? 'down' : 'neutral');
        }

        const rsiEl = document.getElementById('rsiDisplay');
        if (rsiEl) {
            rsiEl.textContent = rsi.toFixed(1);
            rsiEl.className = 'card-value ' + (rsi > 70 ? 'down' : rsi < 30 ? 'up' : 'neutral');
        }

        const sigEl = document.getElementById('signalStrength');
        if (sigEl) {
            sigEl.textContent = signal;
            sigEl.className = 'card-value ' + (signal.includes('COMPRA') ? 'up' : signal.includes('VENDA') ? 'down' : 'neutral');
        }

        const rsiValEl = document.getElementById('rsiVal');
        if (rsiValEl) rsiValEl.textContent = Math.round(rsi);

        const rsiMarker = document.getElementById('rsiMarker');
        if (rsiMarker) rsiMarker.style.left = Math.min(Math.max(rsi, 0), 100) + '%';

        updateBadge('macdSignal', macdSig);
        updateBadge('bbSignal', lastClose > lastBBU ? 'VENDA' : lastClose < lastBBL ? 'COMPRA' : 'NEUTRO');
        updateBadge('stochSignal', stochSig);
        updateBadge('volSignal', candles[candles.length - 1].volume > 800 ? 'ALTO' : 'BAIXO');

        const alertEl = document.getElementById('mainAlert');
        if (alertEl) {
            if (signal.includes('FORTE')) {
                alertEl.className = 'alert-box ' + (signal.includes('COMPRA') ? 'alert-success' : 'alert-warn');
                alertEl.innerHTML = '<span>' + (signal.includes('COMPRA') ? '🟢' : '🔴') + '</span> <strong>' + signal + '</strong> detectado! Confirme no gráfico antes de operar.';
            } else {
                alertEl.className = 'alert-box alert-info';
                alertEl.innerHTML = '<span>ℹ️</span> Sistema em modo de simulação. Os dados são gerados para fins educacionais. Nenhuma operação real será executada.';
            }
        }
    }

    function updateBadge(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.className = 'signal-badge ' + (text === 'COMPRA' || text === 'ALTO' ? 'signal-buy' : text === 'VENDA' || text === 'BAIXO' ? 'signal-sell' : 'signal-neutral');
    }

    // ========== LOG ==========
    function addLog(msg, type) {
        type = type || 'info';
        const now = new Date();
        const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
        const container = document.getElementById('logContainer');
        if (!container) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = '<span class="log-time">' + time + '</span><span class="log-' + type + '">' + msg + '</span>';
        container.insertBefore(entry, container.firstChild);
        if (container.children.length > 30) container.removeChild(container.lastChild);
    }

    // ========== SIMULADOR ==========
    window.simulateTrade = function(direction) {
        const amount = parseFloat(document.getElementById('simAmount').value) || 100;
        const expiry = document.getElementById('simExpiry').value;
        const resultEl = document.getElementById('simResult');

        const win = Math.random() > 0.45;
        const payout = amount * (win ? 0.85 : -1);
        const result = win ? 'WIN' : 'LOSS';
        const color = win ? '#2ea043' : '#f85149';
        const emoji = win ? '✅' : '❌';

        if (resultEl) {
            resultEl.innerHTML = '<div style="color:' + color + ';font-weight:700;font-size:14px;">' + emoji + ' ' + result + ' — ' + (win ? '+' : '') + 'R$ ' + payout.toFixed(2) + '</div>' +
                '<div style="color:#8b949e;margin-top:4px;">Direção: <strong>' + direction + '</strong> | Expiração: ' + expiry + 'min | Valor: R$ ' + amount.toFixed(2) + '</div>';
        }

        addLog('Simulação ' + direction + ' — Resultado: ' + result + ' (R$ ' + payout.toFixed(2) + ')', win ? 'buy' : 'sell');

        if (soundEnabled) {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = win ? 880 : 220;
                gain.gain.value = 0.1;
                osc.start();
                osc.stop(audioCtx.currentTime + 0.2);
            } catch(e) {}
        }
    };

    // ========== TOGGLES ==========
    window.toggleSwitch = function(el) {
        el.classList.toggle('on');
        const id = el.id;
        if (id === 'soundToggle') soundEnabled = el.classList.contains('on');
        if (id === 'autoToggle') autoAnalysis = el.classList.contains('on');
        if (id === 'maToggle') { showMA = el.classList.contains('on'); drawChart(); }
        if (id === 'bbToggle') { showBB = el.classList.contains('on'); drawChart(); }
    };

    // ========== TIMEFRAMES ==========
    function setupTimeframes() {
        document.querySelectorAll('.tf-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentTF = this.dataset.tf;
                candleCount = currentTF === '1M' ? 60 : currentTF === '5M' ? 48 : currentTF === '15M' ? 40 : 30;
                candles = generateCandles(100, currentPrice);
                updateIndicators();
                drawChart();
                addLog('Timeframe alterado para ' + currentTF, 'info');
            });
        });
    }

    // ========== RELÓGIO ==========
    function updateClock() {
        const clockEl = document.getElementById('clock');
        if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('pt-BR');
    }

    // ========== ATUALIZAÇÃO EM TEMPO REAL ==========
    function tick() {
        if (!autoAnalysis) return;
        const last = candles[candles.length - 1];
        const change = (Math.random() - 0.48) * 0.001;
        currentPrice = last.close * (1 + change);

        const now = Date.now();
        const tfMs = currentTF === '1M' ? 60000 : currentTF === '5M' ? 300000 : currentTF === '15M' ? 900000 : 3600000;

        if (now - last.time >= tfMs) {
            candles.push({ time: now, open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: Math.floor(Math.random() * 500 + 200) });
            if (candles.length > 120) candles.shift();
            addLog('Novo candle formado em ' + currentTF, 'info');
        } else {
            last.close = currentPrice;
            last.high = Math.max(last.high, currentPrice);
            last.low = Math.min(last.low, currentPrice);
            last.volume += Math.floor(Math.random() * 50);
        }

        updateIndicators();
        drawChart();
    }

    // ========== TOOLTIP ==========
    function setupTooltip() {
        const canvas = document.getElementById('candleCanvas');
        const tooltip = document.getElementById('chartTooltip');
        if (!canvas || !tooltip) return;

        canvas.addEventListener('mousemove', function(e) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const visible = candles.slice(-candleCount);
            const idx = Math.floor((x - 40) / ((rect.width - 80) / visible.length));
            if (idx >= 0 && idx < visible.length) {
                const c = visible[idx];
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY - 50) + 'px';
                tooltip.innerHTML = 'O: ' + c.open.toFixed(5) + '<br>H: ' + c.high.toFixed(5) + '<br>L: ' + c.low.toFixed(5) + '<br>C: ' + c.close.toFixed(5) + '<br>Vol: ' + c.volume;
            }
        });
        canvas.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });
    }

    // ========== INICIALIZAÇÃO ==========
    function init() {
        candles = generateCandles(100, currentPrice);
        updateIndicators();
        drawChart();
        setupTimeframes();
        setupTooltip();
        setInterval(updateClock, 1000);
        updateClock();
        tickInterval = setInterval(tick, 2000);
        window.addEventListener('resize', drawChart);
        addLog('Dashboard inicializado com sucesso', 'info');
        addLog('Indicadores calculados — Tendência de ' + trend + ' detectada', 'info');
        addLog('RSI em zona ' + (rsi > 70 ? 'de sobrecompra' : rsi < 30 ? 'de sobrevenda' : 'neutra') + ' (' + rsi.toFixed(1) + ')', 'info');
    }

    // Iniciar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
