use crate::data::{DataUtils, RandomExampleResponse};
use crate::db::Database;
use rand::Rng;
use std::collections::HashMap;
use std::sync::Arc;

const PRONUNCIATION_DATA: &str = include_str!("../data/pronunciation.txt");
const EXAMPLE_LIST: &str = include_str!("../data/examples.txt");

#[derive(Clone)]
pub struct ServerState {
    pronounce_dict: HashMap<&'static str, &'static str>,
    example_list: Vec<&'static str>,
    pub db: Arc<Database>,
}

impl ServerState {
    pub fn new(db: Database) -> Self {
        let mut state = ServerState {
            pronounce_dict: HashMap::new(),
            example_list: vec![],
            db: Arc::new(db),
        };
        state.load_pronounce_dictionary();
        state.load_example_list();
        state
    }

    fn load_pronounce_dictionary(&mut self) {
        PRONUNCIATION_DATA
            .lines()
            .into_iter()
            .filter(|&line| !line.starts_with(&";;;") && !line.is_empty())
            .for_each(|line| {
                if let Some((word, pronounce)) = line.split_once("  ") {
                    self.pronounce_dict.insert(word, pronounce);
                }
            });
    }

    fn load_example_list(&mut self) {
        self.example_list = EXAMPLE_LIST.lines().collect();
    }

    pub fn lookup_pronounce(&self, word: &str) -> String {
        let word = DataUtils::clean_up_word(word).to_uppercase();
        let arpabet = self.pronounce_dict.get(word.as_str()).unwrap_or(&"");
        if arpabet.is_empty() {
            return String::new();
        }
        arpabet_to_ipa(arpabet)
    }

    pub fn get_random_example(&self) -> RandomExampleResponse {
        let index = rand::thread_rng().gen_range(0..self.example_list.len());
        let selected_example = self.example_list[index];
        let pronounce = selected_example
            .split_whitespace()
            .map(|word| self.lookup_pronounce(word))
            .collect();
        RandomExampleResponse::new(selected_example, pronounce)
    }
}

fn arpabet_to_ipa(arpabet: &str) -> String {
    let mut ipa = String::from("/");
    for phoneme in arpabet.split_whitespace() {
        // Strip stress digits for lookup, keep for stress marking
        let base = phoneme.trim_end_matches(|c: char| c.is_ascii_digit());
        let stress = phoneme.chars().last().and_then(|c| {
            if c.is_ascii_digit() { Some(c) } else { None }
        });

        let ipa_symbol = match base {
            "AA" => "ɑː",
            "AE" => "æ",
            "AH" => "ʌ",
            "AO" => "ɔː",
            "AW" => "aʊ",
            "AX" => "ə",
            "AY" => "aɪ",
            "B" => "b",
            "CH" => "tʃ",
            "D" => "d",
            "DH" => "ð",
            "EH" => "ɛ",
            "ER" => "ɝ",
            "EY" => "eɪ",
            "F" => "f",
            "G" => "ɡ",
            "HH" => "h",
            "IH" => "ɪ",
            "IY" => "iː",
            "JH" => "dʒ",
            "K" => "k",
            "L" => "l",
            "M" => "m",
            "N" => "n",
            "NG" => "ŋ",
            "OW" => "oʊ",
            "OY" => "ɔɪ",
            "P" => "p",
            "R" => "ɹ",
            "S" => "s",
            "SH" => "ʃ",
            "T" => "t",
            "TH" => "θ",
            "UH" => "ʊ",
            "UW" => "uː",
            "V" => "v",
            "W" => "w",
            "Y" => "j",
            "Z" => "z",
            "ZH" => "ʒ",
            _ => base,
        };

        // Add primary stress mark before stressed syllable
        if stress == Some('1') {
            ipa.push('ˈ');
        } else if stress == Some('2') {
            ipa.push('ˌ');
        }
        ipa.push_str(ipa_symbol);
    }
    ipa.push('/');
    ipa
}
