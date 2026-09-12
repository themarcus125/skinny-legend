import Testing
import Foundation
@testable import SkinnyLegend

@Suite("FeedbackModel")
@MainActor
struct FeedbackModelTests {
    @Test("Requires a non-empty message of at most 2000 characters")
    func validatesMessage() {
        let model = FeedbackModel(api: MockAPIClient())
        #expect(model.canSend == false)

        model.message = "   "
        #expect(model.canSend == false)

        model.message = "Nút xác nhận hơi nhỏ."
        #expect(model.canSend)

        model.message = String(repeating: "a", count: 2001)
        #expect(model.canSend == false)
    }

    @Test("Sends a message with no screenshot")
    func sendsPlainMessage() async {
        let model = FeedbackModel(api: MockAPIClient())
        model.message = "Ứng dụng chạy mượt."
        await model.send()
        #expect(model.didSend)
        #expect(model.errorMessage == nil)
    }

    @Test("Attaches and removes a screenshot")
    func attachesScreenshot() async {
        let model = FeedbackModel(api: MockAPIClient())
        model.useScreenshot(data: JPEGFactory.make(width: 1200, height: 2000))
        #expect(model.screenshot != nil)
        model.removeScreenshot()
        #expect(model.screenshot == nil)
    }

    @Test("Sends a message with an uploaded screenshot")
    func sendsWithScreenshot() async {
        let model = FeedbackModel(api: MockAPIClient())
        model.message = "Ảnh chụp màn hình lỗi."
        model.useScreenshot(data: JPEGFactory.make(width: 1200, height: 2000))
        await model.send()
        #expect(model.didSend)
        #expect(model.errorMessage == nil)
    }

    @Test("Surfaces a send failure and stays unsent")
    func surfacesFailure() async {
        let error = APIError(status: 0, code: "network", message: "offline")
        let model = FeedbackModel(api: FailingClient(error: error))
        model.message = "Không gửi được."
        await model.send()
        #expect(model.didSend == false)
        #expect(model.errorMessage == error.userMessage)
    }
}
