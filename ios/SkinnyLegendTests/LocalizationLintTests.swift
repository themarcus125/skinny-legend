import Foundation
import Testing

/// Fails when a Vietnamese string literal in Swift source has no translated `en` entry in
/// `Localizable.xcstrings` (spec §D). The catalog's source language is Vietnamese, so a
/// migrated string still *reads* Vietnamese in source — `Text("Tập luyện")` is already a
/// `LocalizedStringKey` lookup. What must never happen is Vietnamese copy that the catalog
/// has never heard of, because that string can only ever render in Vietnamese.
///
/// `#filePath` is resolved at compile time and the Simulator shares the host filesystem, so
/// the test reads the checked-out sources and the checked-out catalog directly.
@Suite("Localization lint")
struct LocalizationLintTests {
    /// Every Vietnamese letter with a diacritic, plus đ/Đ. A literal containing any of these
    /// is Vietnamese copy by definition.
    static let vietnameseLetters = Set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ")

    /// Files whose Vietnamese text is fixture data, not shipped UI copy.
    /// Nothing may be added here without a one-line reason.
    static let allowedFiles: Set<String> = [
        "Core/Mock/MockSeed.swift",   // seeded place names, AI reasons and display names — test fixtures
        "Core/Mock/MockPlace.swift",  // seeded POI names for the offline place picker
        "Core/Mock/MockAPIClient.swift",  // canned AI-verdict reasons the offline mock returns as server data, not UI copy
    ]

    /// Placeholder every interpolation and printf directive collapses to, so a source literal
    /// (`\(days)`) and the key Xcode stores for it (`%lld`) compare equal.
    static let placeholder = "\u{1}"

    static var sourceRoot: URL {
        URL(fileURLWithPath: #filePath)          // …/ios/SkinnyLegendTests/LocalizationLintTests.swift
            .deletingLastPathComponent()          // …/ios/SkinnyLegendTests
            .deletingLastPathComponent()          // …/ios
            .appending(path: "SkinnyLegend")
    }

    static var catalogURL: URL { sourceRoot.appending(path: "Localizable.xcstrings") }

    private struct Catalog: Decodable {
        struct Entry: Decodable {
            struct Localization: Decodable {
                struct Unit: Decodable {
                    let state: String
                    let value: String
                }
                let stringUnit: Unit?
            }
            let localizations: [String: Localization]?
        }
        let sourceLanguage: String
        let strings: [String: Entry]
    }

    private static func catalog() throws -> Catalog {
        try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: catalogURL))
    }

    /// Catalog keys that carry a non-empty, `translated` English value, in normalised form.
    static func translatedKeys() throws -> Set<String> {
        Set(try catalog().strings.compactMap { key, entry -> String? in
            guard let unit = entry.localizations?["en"]?.stringUnit,
                  unit.state == "translated", !unit.value.isEmpty else { return nil }
            return normalize(key)
        })
    }

    // MARK: Normalisation

    /// Collapses every Swift interpolation (`\(days)`, including nested parens such as
    /// `\(Int(fraction * 100))` and nested literals such as `\(name ?? "")`) and every printf
    /// placeholder (`%lld`, `%@`, `%1$@`, `%.1f`) to one sentinel, then unescapes `%%` — a
    /// literal `%` in source is stored as `%%` by `LocalizedStringKey`, so the catalog key and
    /// the source literal only agree after both steps.
    static func normalize(_ text: String) -> String {
        var out = collapseInterpolations(in: text)
        let printf = "%[0-9]*\\$?[0-9.#+' -]*(?:lld|ld|lf|llu|lu|[dfus@])"
        if let regex = try? NSRegularExpression(pattern: printf) {
            out = regex.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: placeholder)
        }
        out = out.replacingOccurrences(of: "%%", with: "%")
        return out.trimmingCharacters(in: .whitespaces)
    }

    /// Replaces each `\( … )` with the sentinel using a balanced-paren scan that also skips
    /// over string literals inside the interpolation (so a `)` or `"` inside `?? ""` does not
    /// end it early).
    static func collapseInterpolations(in text: String) -> String {
        let chars = Array(text)
        var out = ""
        var i = 0
        while i < chars.count {
            if chars[i] == "\\", i + 1 < chars.count, chars[i + 1] == "(" {
                out.append(placeholder)
                i = endOfInterpolation(chars, openParenAt: i + 1)
            } else {
                out.append(chars[i])
                i += 1
            }
        }
        return out
    }

    // MARK: Source scanning

    /// Index just past the `)` that balances the `(` at `start`.
    private static func endOfInterpolation(_ chars: [Character], openParenAt start: Int) -> Int {
        var depth = 0
        var i = start
        while i < chars.count {
            switch chars[i] {
            case "(":
                depth += 1
            case ")":
                depth -= 1
                if depth == 0 { return i + 1 }
            case "\"":
                i = endOfLiteral(chars, openQuoteAt: i)
                continue
            default:
                break
            }
            i += 1
        }
        return chars.count
    }

    /// Index just past the `"` that closes the literal opened at `start`. Escapes are honoured
    /// and interpolations are stepped over with `endOfInterpolation`, so the two recurse for
    /// literals nested inside interpolations nested inside literals.
    private static func endOfLiteral(_ chars: [Character], openQuoteAt start: Int) -> Int {
        var i = start + 1
        while i < chars.count {
            switch chars[i] {
            case "\\":
                if i + 1 < chars.count, chars[i + 1] == "(" {
                    i = endOfInterpolation(chars, openParenAt: i + 1)
                } else {
                    i += 2
                }
                continue
            case "\"":
                return i + 1
            default:
                i += 1
            }
        }
        return chars.count
    }

    /// Every `"…"` literal on one line, with the quotes removed and interpolations kept
    /// verbatim. Scanning stops at a `//` that is outside every literal.
    static func stringLiterals(in line: String) -> [String] {
        let chars = Array(line)
        var literals: [String] = []
        var i = 0
        while i < chars.count {
            if chars[i] == "/", i + 1 < chars.count, chars[i + 1] == "/" { break }
            if chars[i] == "\"" {
                let end = endOfLiteral(chars, openQuoteAt: i)
                literals.append(String(chars[(i + 1)..<max(i + 1, end - 1)]))
                i = end
            } else {
                i += 1
            }
        }
        return literals
    }

    static func containsVietnamese(_ text: String) -> Bool {
        text.contains { vietnameseLetters.contains($0) }
    }

    /// Every literal containing a Vietnamese letter, on a line that is not a comment and not
    /// a `#Preview` title, paired with `file:line` for the failure message.
    static func vietnameseLiterals() throws -> [(location: String, literal: String)] {
        let fm = FileManager.default
        var found: [(location: String, literal: String)] = []
        guard let walker = fm.enumerator(at: sourceRoot, includingPropertiesForKeys: nil) else { return [] }
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: sourceRoot.path + "/", with: "")
            if allowedFiles.contains(relative) { continue }
            let text = try String(contentsOf: url, encoding: .utf8)
            for (index, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("//") || trimmed.hasPrefix("*") || trimmed.hasPrefix("#Preview(") { continue }
                for literal in stringLiterals(in: String(line)) where containsVietnamese(literal) {
                    found.append(("\(relative):\(index + 1)", literal))
                }
            }
        }
        return found.sorted { $0.location < $1.location }
    }

    // MARK: The gate

    @Test func everyVietnameseLiteralIsInTheStringCatalog() throws {
        let keys = try Self.translatedKeys()
        let offenders = try Self.vietnameseLiterals()
            .filter { !keys.contains(Self.normalize($0.literal)) }
            .map { "\($0.location): \($0.literal)" }
        #expect(offenders.isEmpty, "\(offenders.count) Vietnamese literal(s) with no translated `en` entry in Localizable.xcstrings:\n\(offenders.joined(separator: "\n"))")
    }

    @Test func theCatalogIsVietnameseSourcedAndFullyTranslated() throws {
        let catalog = try Self.catalog()
        #expect(catalog.sourceLanguage == "vi")
        let untranslated = catalog.strings
            .filter { $0.value.localizations?["en"]?.stringUnit?.state != "translated" }
            .keys.sorted()
        #expect(untranslated.isEmpty, "keys with no translated English value: \(untranslated)")
    }

    @Test func noEnglishValueIsIdenticalToItsVietnameseKey() throws {
        // `Tiếng Việt` / `English` are language endonyms — they read the same in both languages.
        let properNouns: Set<String> = ["Skinny Legend", "Momo", "Google", "Strava", "Tiếng Việt", "English"]
        let echoes = try Self.catalog().strings
            .filter { key, entry in
                guard let value = entry.localizations?["en"]?.stringUnit?.value else { return false }
                return value == key && !properNouns.contains(key)
            }
            .keys.sorted()
        #expect(echoes.isEmpty, "English values that were never translated: \(echoes)")
    }

    // MARK: The scanner itself

    @Test func normalizeCollapsesInterpolationsAndPlaceholdersAlike() {
        let p = Self.placeholder
        #expect(Self.normalize("Còn \\(days) ngày") == "Còn \(p) ngày")
        #expect(Self.normalize("Còn %lld ngày") == "Còn \(p) ngày")
        #expect(Self.normalize("Đã đủ %2$@ %1$@ — thử lại") == "Đã đủ \(p) \(p) — thử lại")
        #expect(Self.normalize("Tỉ lệ %.1f") == "Tỉ lệ \(p)")
    }

    @Test func normalizeHandlesNestedParensLiteralsAndEscapedPercent() {
        let p = Self.placeholder
        #expect(Self.normalize("Đang tải ảnh lên… \\(Int(fraction * 100))%") == "Đang tải ảnh lên… \(p)%")
        #expect(Self.normalize("Đang tải ảnh lên… %lld%%") == "Đang tải ảnh lên… \(p)%")
        #expect(Self.normalize("Đã đủ \\($0.label) — \\(Rulebook.capNoun(for: $0))") == "Đã đủ \(p) — \(p)")
        #expect(Self.normalize("Hồ sơ của \\(env.currentUser?.displayName ?? \"\")") == "Hồ sơ của \(p)")
        #expect(Self.normalize("Hồ sơ của %@") == "Hồ sơ của \(p)")
    }

    @Test func stringLiteralsScanWholeLiteralsAndSkipComments() {
        let line = #".accessibilityLabel("Hồ sơ của \(env.currentUser?.displayName ?? "")") // "ghi chú"#
        #expect(Self.stringLiterals(in: line) == [#"Hồ sơ của \(env.currentUser?.displayName ?? "")"#])
        #expect(Self.stringLiterals(in: #"Text(failed ? "Hãy chọn" : reason)"#) == ["Hãy chọn"])
        #expect(Self.stringLiterals(in: #"let a = "x\"y""#) == [#"x\"y"#])
        #expect(Self.containsVietnamese("Hãy chọn"))
        #expect(!Self.containsVietnamese("figure.run"))
    }
}
