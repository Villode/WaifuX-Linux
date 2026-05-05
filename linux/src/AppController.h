#pragma once

#include <QObject>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QProcess>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

#include <functional>

class AppController final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString currentTab READ currentTab WRITE setCurrentTab NOTIFY currentTabChanged)
    Q_PROPERTY(bool loading READ loading NOTIFY loadingChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString toast READ toast NOTIFY toastChanged)
    Q_PROPERTY(int mediaMode READ mediaMode WRITE setMediaMode NOTIFY mediaModeChanged)
    Q_PROPERTY(QVariantList wallpapers READ wallpapers NOTIFY wallpapersChanged)
    Q_PROPERTY(QVariantList media READ media NOTIFY mediaChanged)
    Q_PROPERTY(QVariantList anime READ anime NOTIFY animeChanged)
    Q_PROPERTY(QVariantList workshop READ workshop NOTIFY workshopChanged)
    Q_PROPERTY(QVariantList libraryWallpapers READ libraryWallpapers NOTIFY libraryChanged)
    Q_PROPERTY(QVariantList libraryMedia READ libraryMedia NOTIFY libraryChanged)
    Q_PROPERTY(QVariantList libraryWorkshop READ libraryWorkshop NOTIFY libraryChanged)
    Q_PROPERTY(QVariantList dependencies READ dependencies NOTIFY dependenciesChanged)
    Q_PROPERTY(QVariantMap settings READ settings NOTIFY settingsChanged)
    Q_PROPERTY(QVariantMap paths READ paths NOTIFY pathsChanged)

public:
    explicit AppController(QObject *parent = nullptr);
    ~AppController() override;

    QString currentTab() const { return m_currentTab; }
    bool loading() const { return m_loading; }
    QString status() const { return m_status; }
    QString toast() const { return m_toast; }
    int mediaMode() const { return m_mediaMode; }
    QVariantList wallpapers() const { return m_wallpapers; }
    QVariantList media() const { return m_media; }
    QVariantList anime() const { return m_anime; }
    QVariantList workshop() const { return m_workshop; }
    QVariantList libraryWallpapers() const { return m_libraryWallpapers; }
    QVariantList libraryMedia() const { return m_libraryMedia; }
    QVariantList libraryWorkshop() const { return m_libraryWorkshop; }
    QVariantList dependencies() const { return m_dependencies; }
    QVariantMap settings() const { return m_settings; }
    QVariantMap paths() const { return m_paths; }

    Q_INVOKABLE void initialize();
    Q_INVOKABLE void setCurrentTab(const QString &tab);
    Q_INVOKABLE void setMediaMode(int mode);
    Q_INVOKABLE void loadHome();
    Q_INVOKABLE void loadWallpapers(const QString &query = QString(), int page = 1);
    Q_INVOKABLE void loadMedia(const QString &query = QString(), int page = 1);
    Q_INVOKABLE void loadAnime(const QString &query = QString(), int page = 1);
    Q_INVOKABLE void loadWorkshop(const QString &query = QString(), int page = 1);
    Q_INVOKABLE void loadLibrary();
    Q_INVOKABLE void checkDependencies();
    Q_INVOKABLE void writeDependencyInstallScript();
    Q_INVOKABLE void updateSetting(const QString &key, const QVariant &value);
    Q_INVOKABLE void openLibraryFolder();
    Q_INVOKABLE void openExternal(const QString &url);
    Q_INVOKABLE void downloadWallpaper(const QVariantMap &item);
    Q_INVOKABLE void applyWallpaper(const QVariantMap &item);
    Q_INVOKABLE void downloadMedia(const QVariantMap &item);
    Q_INVOKABLE void applyLiveWallpaper(const QVariantMap &item);
    Q_INVOKABLE void stopLiveWallpaper();
    Q_INVOKABLE void downloadWorkshop(const QVariantMap &item);
    Q_INVOKABLE void applyWorkshop(const QVariantMap &item);
    Q_INVOKABLE void importPath(const QString &path);

signals:
    void currentTabChanged();
    void loadingChanged();
    void statusChanged();
    void toastChanged();
    void mediaModeChanged();
    void wallpapersChanged();
    void mediaChanged();
    void animeChanged();
    void workshopChanged();
    void libraryChanged();
    void dependenciesChanged();
    void settingsChanged();
    void pathsChanged();

private:
    using JsonCallback = std::function<void(const QJsonDocument &)>;
    using TextCallback = std::function<void(const QString &)>;
    using FileCallback = std::function<void(const QString &)>;

    void setLoading(bool loading);
    void setStatus(const QString &status);
    void showToast(const QString &message);
    void ensureDirectories();
    void readSettings();
    void writeSettings();
    void refreshPaths();

    void getJson(const QUrl &url, const JsonCallback &callback);
    void postJson(const QUrl &url, const QJsonObject &body, const JsonCallback &callback);
    void getText(const QUrl &url, const TextCallback &callback);
    void downloadToFile(const QUrl &url, const QString &prefix, const QString &targetDir, const QString &fallbackSuffix, const FileCallback &callback);

    QVariantMap normalizeWallhaven(const QJsonObject &object) const;
    QVariantList parseFourKWallpapers(const QString &html) const;
    QVariantList parseMotionItems(const QString &html) const;
    QVariantMap parseMotionDetail(const QString &html, const QVariantMap &base) const;
    QVariantMap normalizeBangumi(const QJsonObject &object) const;
    QVariantList parseWorkshopItems(const QString &html) const;
    QVariantList scanFiles(const QString &root, const QStringList &suffixes, const QString &kind) const;

    QString appDir() const;
    QString cacheDir() const;
    QString picturesDir() const;
    QString videosDir() const;
    QString downloadRoot() const;
    QString wallpaperDir() const;
    QString mediaDir() const;
    QString workshopDir() const;
    QString importDir() const;
    QString ddeVideoDir() const;
    QString statePath() const;
    QString liveWallpaperLogPath() const;

    bool commandExists(const QString &command) const;
    QString commandPath(const QString &command) const;
    bool run(const QString &program, const QStringList &arguments, int timeoutMs = 5000) const;
    QString runOutput(const QString &program, const QStringList &arguments, int timeoutMs = 5000) const;
    bool isDeepinDdeX11() const;
    QVariantMap deepinNativeStatus() const;
    void prepareDeepinVideo(const QString &filePath, const FileCallback &callback);
    bool setDeepinVideoEnabled(bool enabled) const;
    void fixDeepinDesktopWindowHints() const;
    bool setLinuxWallpaper(const QString &filePath, QString *appliedBy) const;
    void startLiveProcess(const QString &program, const QStringList &arguments, const QString &label);
    void stopTrackedLiveProcess();
    QString localFilePathFromItem(const QVariantMap &item) const;

    static QString htmlAttr(const QString &tag, const QString &name);
    static QString stripTags(QString text);
    static QString htmlDecode(QString text);
    static QString absoluteUrl(const QString &value, const QString &base);
    static QString sanitizeFileName(QString value);
    static QVariantMap itemMap(const QString &id, const QString &title, const QString &kind);

    QNetworkAccessManager m_network;
    QProcess *m_liveProcess = nullptr;
    QString m_currentTab = QStringLiteral("home");
    bool m_loading = false;
    QString m_status;
    QString m_toast;
    int m_mediaMode = 0;
    int m_mediaPage = 1;
    int m_workshopPage = 1;
    QVariantList m_wallpapers;
    QVariantList m_media;
    QVariantList m_anime;
    QVariantList m_workshop;
    QVariantList m_libraryWallpapers;
    QVariantList m_libraryMedia;
    QVariantList m_libraryWorkshop;
    QVariantList m_dependencies;
    QVariantMap m_settings;
    QVariantMap m_paths;
};
