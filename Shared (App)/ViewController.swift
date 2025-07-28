//
//  ViewController.swift
//  Shared (App)
//
//  Created by Wais Almakaleh on 4/16/25.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "me.wais.WebTeX.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {
#if os(iOS)
    private var exitButton: UIButton!
#endif

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        // Configure persistent exit button
        exitButton = UIButton(type: .system)
        exitButton.translatesAutoresizingMaskIntoConstraints = false
        exitButton.setTitle("✕", for: .normal)
        exitButton.setTitleColor(.white, for: .normal)
        exitButton.backgroundColor = UIColor(displayP3Red: 106/255, green: 13/255, blue: 173/255, alpha: 1)
        exitButton.layer.cornerRadius = 16
        if #available(iOS 15.0, *) {
            var cfg = UIButton.Configuration.filled()
            cfg.baseBackgroundColor = UIColor(displayP3Red: 106/255, green: 13/255, blue: 173/255, alpha: 1)
            cfg.title = "✕"
            cfg.titlePadding = 6
            exitButton.configuration = cfg
        } else {
            exitButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
        }
        exitButton.layer.shadowColor = UIColor.black.cgColor
        exitButton.layer.shadowOpacity = 0.4
        exitButton.layer.shadowOffset = CGSize(width: 0, height: 2)
        exitButton.layer.shadowRadius = 3
        exitButton.isHidden = true
        exitButton.addTarget(self, action: #selector(closeExternal), for: .touchUpInside)
        view.addSubview(exitButton)
        NSLayoutConstraint.activate([
            exitButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            exitButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8)
        ])
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    // Allow external links to load within the web view
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil {
#if os(iOS)
            webView.scrollView.isScrollEnabled = true
            exitButton.isHidden = false
#endif
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        let isLocal = webView.url?.isFileURL ?? false
        webView.scrollView.isScrollEnabled = !isLocal
        exitButton.isHidden = isLocal
#endif
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
#endif
    }

#if os(iOS)
    @objc func closeExternal() {
        exitButton.isHidden = true
        webView.scrollView.isScrollEnabled = false
        webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }
#endif

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(macOS)
        if (message.body as! String != "open-preferences") {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                NSApp.terminate(self)
            }
        }
#endif
    }

}
