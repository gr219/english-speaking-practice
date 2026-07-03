use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GrammarResult {
    pub score: f64,
    pub issues: Vec<GrammarIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GrammarIssue {
    pub kind: String,
    pub message: String,
}

/// Analyze grammar by comparing the spoken text against the target text.
/// Returns None if no target text is provided (can't assess grammar without reference).
pub fn analyze_grammar(spoken_text: &str, target_text: Option<&str>) -> Option<GrammarResult> {
    let target = target_text?;
    if target.is_empty() {
        return None;
    }

    let spoken_words = normalize_words(spoken_text);
    let target_words = normalize_words(target);

    if target_words.is_empty() {
        return None;
    }

    let mut issues: Vec<GrammarIssue> = Vec::new();

    // Compute edit distance to find missing/extra/substituted words
    let ops = compute_edit_ops(&target_words, &spoken_words);

    let mut missing_words: Vec<String> = Vec::new();
    let mut extra_words: Vec<String> = Vec::new();
    let mut wrong_words: Vec<(String, String)> = Vec::new();

    for op in &ops {
        match op {
            EditOp::Delete(idx) => {
                missing_words.push(target_words[*idx].clone());
            }
            EditOp::Insert(idx) => {
                extra_words.push(spoken_words[*idx].clone());
            }
            EditOp::Substitute(t_idx, s_idx) => {
                wrong_words.push((target_words[*t_idx].clone(), spoken_words[*s_idx].clone()));
            }
            EditOp::Match(_, _) => {}
        }
    }

    if !missing_words.is_empty() {
        issues.push(GrammarIssue {
            kind: "missing_words".to_string(),
            message: format!("Missing: {}", missing_words.join(", ")),
        });
    }

    if !extra_words.is_empty() {
        issues.push(GrammarIssue {
            kind: "extra_words".to_string(),
            message: format!("Extra words: {}", extra_words.join(", ")),
        });
    }

    for (expected, got) in &wrong_words {
        issues.push(GrammarIssue {
            kind: "wrong_word".to_string(),
            message: format!("Expected \"{}\" but said \"{}\"", expected, got),
        });
    }

    // Check word order (for words that exist in both but are out of order)
    let order_issues = check_word_order(&target_words, &spoken_words);
    if order_issues > 0 {
        issues.push(GrammarIssue {
            kind: "word_order".to_string(),
            message: format!("{} word(s) out of order", order_issues),
        });
    }

    // Score calculation:
    // - Each correct match gets full credit
    // - Missing, extra, substituted words reduce the score
    let total_target = target_words.len() as f64;
    let match_count = ops.iter().filter(|op| matches!(op, EditOp::Match(_, _))).count() as f64;
    let error_count = (missing_words.len() + extra_words.len() + wrong_words.len()) as f64;

    // Grammar score: percentage of target words correctly spoken
    // Penalize extra words slightly less than missing/wrong ones
    let penalty = missing_words.len() as f64 + wrong_words.len() as f64 + extra_words.len() as f64 * 0.5;
    let score = ((match_count / (match_count + penalty)) * 100.0).max(0.0).min(100.0);

    // If no errors at all, perfect score
    let score = if error_count == 0.0 { 100.0 } else { score };

    Some(GrammarResult { score, issues })
}

fn normalize_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '\'')
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

#[derive(Debug)]
enum EditOp {
    Match(usize, usize),
    Substitute(usize, usize),
    Delete(usize),
    Insert(usize),
}

/// Compute the edit operations to transform target into spoken using dynamic programming.
fn compute_edit_ops(target: &[String], spoken: &[String]) -> Vec<EditOp> {
    let m = target.len();
    let n = spoken.len();

    // dp[i][j] = edit distance between target[0..i] and spoken[0..j]
    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            if target[i - 1] == spoken[j - 1] {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + dp[i - 1][j - 1]
                    .min(dp[i - 1][j])
                    .min(dp[i][j - 1]);
            }
        }
    }

    // Backtrace to find operations
    let mut ops = Vec::new();
    let mut i = m;
    let mut j = n;

    while i > 0 || j > 0 {
        if i > 0 && j > 0 && target[i - 1] == spoken[j - 1] {
            ops.push(EditOp::Match(i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1 {
            ops.push(EditOp::Substitute(i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if i > 0 && dp[i][j] == dp[i - 1][j] + 1 {
            ops.push(EditOp::Delete(i - 1));
            i -= 1;
        } else {
            ops.push(EditOp::Insert(j - 1));
            j -= 1;
        }
    }

    ops.reverse();
    ops
}

/// Check how many words are out of order by computing longest common subsequence.
fn check_word_order(target: &[String], spoken: &[String]) -> usize {
    // Find words common to both (by finding them in spoken order)
    let common_in_spoken: Vec<&String> = spoken.iter().filter(|w| target.contains(w)).collect();
    let common_in_target: Vec<&String> = target.iter().filter(|w| spoken.contains(w)).collect();

    if common_in_spoken.len() <= 1 {
        return 0;
    }

    // LCS length between the common words in target order vs spoken order
    let lcs_len = lcs_length(&common_in_target, &common_in_spoken);
    let out_of_order = common_in_spoken.len().saturating_sub(lcs_len);
    out_of_order
}

fn lcs_length(a: &[&String], b: &[&String]) -> usize {
    let m = a.len();
    let n = b.len();
    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for i in 1..=m {
        for j in 1..=n {
            if a[i - 1] == b[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j].max(dp[i][j - 1]);
            }
        }
    }

    dp[m][n]
}
