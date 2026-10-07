import UIKit

final class WebErrorView: UIView {
    var onRetry: (() -> Void)?

    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let retryButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureView()
    }

    func show(title: String, message: String) {
        titleLabel.text = title
        messageLabel.text = message
        isHidden = false
    }

    private func configureView() {
        backgroundColor = .systemBackground

        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center

        messageLabel.font = .preferredFont(forTextStyle: .body)
        messageLabel.textColor = .secondaryLabel
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        var buttonConfiguration = UIButton.Configuration.filled()
        buttonConfiguration.title = "重试"
        buttonConfiguration.image = UIImage(systemName: "arrow.clockwise")
        buttonConfiguration.imagePadding = 8
        retryButton.configuration = buttonConfiguration
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)

        let stackView = UIStackView(arrangedSubviews: [titleLabel, messageLabel, retryButton])
        stackView.axis = .vertical
        stackView.alignment = .center
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.centerXAnchor.constraint(equalTo: centerXAnchor),
            stackView.centerYAnchor.constraint(equalTo: centerYAnchor),
            stackView.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 28),
            trailingAnchor.constraint(greaterThanOrEqualTo: stackView.trailingAnchor, constant: 28),
            messageLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 320)
        ])
    }

    @objc private func retry() {
        onRetry?()
    }
}
