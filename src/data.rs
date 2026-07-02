use crate::fluency::FluencyResult;
use serde::Serialize;
use vosk::CompleteResultSingle;

pub struct DataUtils;

impl DataUtils {
    pub fn clean_up_word(word: &str) -> String {
        word.chars()
            .filter(|c| c.is_alphanumeric() || *c == '\'')
            .collect()
    }
}

#[derive(Serialize)]
pub struct RandomExampleResponse {
    pub text: &'static str,
    pub pronounce: Vec<String>,
}

impl RandomExampleResponse {
    pub fn new(text: &'static str, pronounce: Vec<String>) -> Self {
        Self { text, pronounce }
    }
}

#[derive(Serialize, Clone)]
pub struct Word {
    pub text: String,
    pub score: f32,
    pub start: f32,
    pub end: f32,
}

#[derive(Serialize)]
pub struct SpeechAnalyzeResult {
    pub id: String,
    pub text: String,
    pub words: Vec<Word>,
    pub score: f64,
    pub fluency: Option<FluencyResult>,
    pub example_text: Option<String>,
    pub ielts_band: Option<f64>,
}

impl SpeechAnalyzeResult {
    pub fn from_vosk(single: CompleteResultSingle) -> Self {
        let text = single.text.to_owned();
        let words: Vec<Word> = single
            .result
            .iter()
            .map(|w| Word {
                text: w.word.to_owned(),
                score: w.conf,
                start: w.start,
                end: w.end,
            })
            .collect();
        let score = if words.is_empty() {
            0.0
        } else {
            words.iter().map(|w| w.score as f64).sum::<f64>() / words.len() as f64 * 100.0
        };
        Self {
            id: String::new(),
            text,
            words,
            score,
            fluency: None,
            example_text: None,
            ielts_band: None,
        }
    }

    pub fn compute_ielts_band(&mut self) {
        let pronunciation_score = self.score;
        let fluency_score = self.fluency.as_ref().map(|f| f.score).unwrap_or(pronunciation_score);
        // Weighted: 60% pronunciation, 40% fluency
        let combined = pronunciation_score * 0.6 + fluency_score * 0.4;
        // Map 0-100 to IELTS 1.0-9.0
        let band = if combined >= 95.0 {
            9.0
        } else if combined >= 85.0 {
            8.0 + (combined - 85.0) / 10.0
        } else if combined >= 75.0 {
            7.0 + (combined - 75.0) / 10.0
        } else if combined >= 60.0 {
            6.0 + (combined - 60.0) / 15.0
        } else if combined >= 45.0 {
            5.0 + (combined - 45.0) / 15.0
        } else if combined >= 30.0 {
            4.0 + (combined - 30.0) / 15.0
        } else {
            (combined / 30.0 * 3.0 + 1.0).max(1.0)
        };
        // Round to nearest 0.5
        self.ielts_band = Some((band * 2.0).round() / 2.0);
    }
}
