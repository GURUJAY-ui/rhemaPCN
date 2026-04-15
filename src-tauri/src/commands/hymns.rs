use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hymn {
    pub number: String,
    pub title: String,
    #[serde(rename = "titleWithHymnNumber")]
    pub title_with_hymn_number: String,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub chorus: Option<String>,
    #[serde(default)]
    pub verses: Vec<String>,
    #[serde(default)]
    pub sound: String,
    #[serde(default)]
    pub category: Option<String>,
}

#[derive(Deserialize)]
struct HymnFile {
    hymns: BTreeMap<String, Hymn>,
}

fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OptionalString {
        String(String),
        Bool(()),
        Null,
    }

    match OptionalString::deserialize(deserializer)? {
        OptionalString::String(value) => Ok(Some(value)),
        OptionalString::Bool(_) | OptionalString::Null => Ok(None),
    }
}

#[tauri::command]
pub fn get_hymns() -> Result<Vec<Hymn>, String> {
    let raw = include_str!("../../ghs.json");
    let data: HymnFile = serde_json::from_str(raw)
        .map_err(|e| format!("Failed to parse hymn library: {}", e))?;

    let mut hymns: Vec<Hymn> = data.hymns.into_values().collect();
    hymns.sort_by_key(|h| h.number.parse::<u32>().unwrap_or_default());
    Ok(hymns)
}
