import Foundation
@testable import SkinnyLegend

enum FixtureError: Error, CustomStringConvertible {
    case missing(String)

    var description: String {
        switch self {
        case .missing(let name): "Fixture \(name).json is not in the test bundle"
        }
    }
}

enum Fixture {
    private final class BundleToken {}

    static func data(_ name: String) throws -> Data {
        guard let url = Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json") else {
            throw FixtureError.missing(name)
        }
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONCoding.makeDecoder().decode(T.self, from: data(name))
    }
}
