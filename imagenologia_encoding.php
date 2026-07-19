<?php

function img_looks_mojibake(string $value): bool
{
    return $value !== '' && preg_match('/(?:Ã.|Â.|â€|�)/u', $value) === 1;
}

function img_fix_mojibake_string($value): string
{
    $text = trim((string)$value);
    if ($text === '' || !img_looks_mojibake($text)) {
        return (string)$value;
    }

    $candidates = [];
    foreach (['Windows-1252', 'ISO-8859-1'] as $fromEncoding) {
        $candidate = @mb_convert_encoding($text, 'UTF-8', $fromEncoding);
        if (is_string($candidate) && $candidate !== '') {
            $candidates[] = $candidate;
        }
    }

    foreach ($candidates as $candidate) {
        if (!img_looks_mojibake($candidate)) {
            return $candidate;
        }
    }

    return (string)$value;
}

function img_fix_mojibake_recursive($value)
{
    if (is_string($value)) {
        return img_fix_mojibake_string($value);
    }

    if (!is_array($value)) {
        return $value;
    }

    foreach ($value as $key => $child) {
        $value[$key] = img_fix_mojibake_recursive($child);
    }

    return $value;
}
