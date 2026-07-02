use crate::data::Word;
use serde::Serialize;

const IDEAL_WPM_MIN: f64 = 120.0;
const IDEAL_WPM_MAX: f64 = 150.0;
const PAUSE_THRESHOLD_SECS: f64 = 0.8;
const PAUSE_PENALTY_POINTS: f64 = 15.0;
const RHYTHM_CV_PERFECT: f64 = 0.3;
const RHYTHM_CV_WORST: f64 = 1.5;
const WEIGHT_SPEECH_RATE: f64 = 0.40;
const WEIGHT_PAUSE: f64 = 0.35;
const WEIGHT_RHYTHM: f64 = 0.25;

#[derive(Debug, Clone, Serialize)]
pub struct FluencyResult {
    pub score: f64,
    pub wpm: f64,
    pub pause_count: u32,
    pub longest_pause: f64,
    pub rhythm_score: f64,
}

pub fn analyze_fluency(words: &[Word]) -> Option<FluencyResult> {
    if words.len() < 2 {
        return None;
    }

    let duration = words.last().unwrap().end as f64 - words.first().unwrap().start as f64;
    if duration <= 0.0 {
        return None;
    }

    // Speech rate
    let wpm = (words.len() as f64 / duration) * 60.0;
    let speech_rate_score = compute_speech_rate_score(wpm);

    // Pause analysis
    let gaps: Vec<f64> = words
        .windows(2)
        .map(|pair| (pair[1].start - pair[0].end) as f64)
        .collect();

    let mut pause_count: u32 = 0;
    let mut longest_pause: f64 = 0.0;
    for &gap in &gaps {
        if gap > PAUSE_THRESHOLD_SECS {
            pause_count += 1;
        }
        if gap > longest_pause {
            longest_pause = gap;
        }
    }
    let pause_score = (100.0 - pause_count as f64 * PAUSE_PENALTY_POINTS).max(0.0);

    // Rhythm analysis
    let rhythm_score = compute_rhythm_score(&gaps);

    // Combined score
    let score = WEIGHT_SPEECH_RATE * speech_rate_score
        + WEIGHT_PAUSE * pause_score
        + WEIGHT_RHYTHM * rhythm_score;

    Some(FluencyResult {
        score,
        wpm,
        pause_count,
        longest_pause,
        rhythm_score,
    })
}

fn compute_speech_rate_score(wpm: f64) -> f64 {
    if wpm >= IDEAL_WPM_MIN && wpm <= IDEAL_WPM_MAX {
        100.0
    } else if wpm < IDEAL_WPM_MIN {
        (100.0 - (IDEAL_WPM_MIN - wpm) * 2.0).max(0.0)
    } else {
        (100.0 - (wpm - IDEAL_WPM_MAX) * 1.5).max(0.0)
    }
}

fn compute_rhythm_score(gaps: &[f64]) -> f64 {
    if gaps.is_empty() {
        return 100.0;
    }
    let mean = gaps.iter().sum::<f64>() / gaps.len() as f64;
    if mean <= 0.0 {
        return 100.0;
    }
    let variance = gaps.iter().map(|g| (g - mean).powi(2)).sum::<f64>() / gaps.len() as f64;
    let std_dev = variance.sqrt();
    let cv = std_dev / mean;

    if cv <= RHYTHM_CV_PERFECT {
        100.0
    } else if cv >= RHYTHM_CV_WORST {
        0.0
    } else {
        100.0 * (1.0 - (cv - RHYTHM_CV_PERFECT) / (RHYTHM_CV_WORST - RHYTHM_CV_PERFECT))
    }
}
