import Testing
import Foundation
@testable import SkinnyLegend

@Suite("APIError")
struct APIErrorTests {
    @Test("Decodes the { error: { code, message } } envelope")
    func decodesEnvelope() throws {
        let error = APIError(status: 403, data: try Fixture.data("error_pending"))
        #expect(error.status == 403)
        #expect(error.code == "pending_approval")
        #expect(error.message == "Account awaiting admin approval")
        #expect(error.isPendingApproval)
        #expect(!error.isUnauthenticated)
    }

    @Test("Falls back to a status-derived code when the body is not an envelope")
    func fallsBack() {
        let error = APIError(status: 502, data: Data("<html>bad gateway</html>".utf8))
        #expect(error.code == "http_502")
        #expect(error.status == 502)
        #expect(!error.message.isEmpty)
    }

    @Test("A 401 is recognised as unauthenticated")
    func unauthenticated() {
        let error = APIError(status: 401, data: Data(#"{"error":{"code":"unauthenticated","message":"Missing or invalid token"}}"#.utf8))
        #expect(error.isUnauthenticated)
        #expect(!error.isPendingApproval)
    }
}
