#include "AppController.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcessEnvironment>
#include <QRegularExpression>
#include <QScreen>
#include <QSet>
#include <QStandardPaths>
#include <QTextStream>
#include <QUrlQuery>

#include <algorithm>

namespace {
constexpr auto WallhavenApi = "https://wallhaven.cc/api/v1";
constexpr auto FourKBase = "https://4kwallpapers.com";
constexpr auto MotionBase = "https://motionbgs.com";
constexpr auto BangumiApi = "https://api.bgm.tv";
constexpr auto SteamBase = "https://steamcommunity.com";
constexpr auto WallpaperEngineAppId = "431960";
constexpr auto DdePluginPackage = "waifux-dde-video-wallpaper-plugin";
constexpr auto DdePluginMinVersion = "1.0.11";

QString env(const char *name)
{
    return QProcessEnvironment::systemEnvironment().value(QString::fromLatin1(name));
}

QUrl withQuery(QString base, const QUrlQuery &query)
{
    QUrl url(std::move(base));
    url.setQuery(query);
    return url;
}

QByteArray userAgent()
{
    return QByteArrayLiteral("WaifuX-Linux-Qt/38.0.94");
}

QString constantString(const char *value)
{
    return QString::fromLatin1(value);
}

QStringList ddePluginPaths()
{
    return {
        QStringLiteral("/usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-edge/libddplugin-videowallpaper.so"),
        QStringLiteral("/usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-core/libddplugin-videowallpaper.so"),
    };
}

QString quote(const QString &value)
{
    QString out = value;
    out.replace('\'', QStringLiteral("'\\''"));
    return QStringLiteral("'") + out + QStringLiteral("'");
}
}

AppController::AppController(QObject *parent)
    : QObject(parent)
{
    refreshPaths();
    readSettings();
}

AppController::~AppController()
{
    stopTrackedLiveProcess();
}

void AppController::initialize()
{
    ensureDirectories();
    refreshPaths();
    checkDependencies();
    loadLibrary();
    loadHome();
}

void AppController::setCurrentTab(const QString &tab)
{
    if (m_currentTab == tab)
        return;

    m_currentTab = tab;
    emit currentTabChanged();

    if (tab == QLatin1String("home")) loadHome();
    else if (tab == QLatin1String("wallpaper")) loadWallpapers();
    else if (tab == QLatin1String("media")) loadMedia();
    else if (tab == QLatin1String("anime")) loadAnime();
    else if (tab == QLatin1String("library")) loadLibrary();
}

void AppController::setMediaMode(int mode)
{
    mode = std::clamp(mode, 0, 2);
    if (m_mediaMode == mode)
        return;
    m_mediaMode = mode;
    emit mediaModeChanged();
    loadMedia();
}

void AppController::setLoading(bool loading)
{
    if (m_loading == loading)
        return;
    m_loading = loading;
    emit loadingChanged();
}

void AppController::setStatus(const QString &status)
{
    if (m_status == status)
        return;
    m_status = status;
    emit statusChanged();
}

void AppController::showToast(const QString &message)
{
    m_toast = message;
    emit toastChanged();
    setStatus(message);
}

QString AppController::appDir() const
{
    return QDir::homePath() + QStringLiteral("/.local/share/WaifuX");
}

QString AppController::cacheDir() const
{
    return QDir::homePath() + QStringLiteral("/.cache/WaifuX");
}

QString AppController::picturesDir() const
{
    const QString pictures = QStandardPaths::writableLocation(QStandardPaths::PicturesLocation);
    return pictures.isEmpty() ? QDir::homePath() + QStringLiteral("/Pictures") : pictures;
}

QString AppController::videosDir() const
{
    const QString movies = QStandardPaths::writableLocation(QStandardPaths::MoviesLocation);
    return movies.isEmpty() ? QDir::homePath() + QStringLiteral("/Videos") : movies;
}

QString AppController::downloadRoot() const { return picturesDir() + QStringLiteral("/WaifuX"); }
QString AppController::wallpaperDir() const { return downloadRoot() + QStringLiteral("/Wallpapers"); }
QString AppController::mediaDir() const { return downloadRoot() + QStringLiteral("/Media"); }
QString AppController::workshopDir() const { return downloadRoot() + QStringLiteral("/Workshop"); }
QString AppController::importDir() const { return downloadRoot() + QStringLiteral("/Imported"); }
QString AppController::ddeVideoDir() const { return videosDir() + QStringLiteral("/video-wallpaper"); }
QString AppController::statePath() const { return appDir() + QStringLiteral("/linux-state.json"); }
QString AppController::liveWallpaperLogPath() const { return cacheDir() + QStringLiteral("/live-wallpaper.log"); }

void AppController::ensureDirectories()
{
    for (const QString &path : { appDir(), cacheDir(), downloadRoot(), wallpaperDir(), mediaDir(), workshopDir(), importDir(), ddeVideoDir() })
        QDir().mkpath(path);
}

void AppController::refreshPaths()
{
    m_paths = {
        { QStringLiteral("app"), appDir() },
        { QStringLiteral("cache"), cacheDir() },
        { QStringLiteral("downloads"), downloadRoot() },
        { QStringLiteral("wallpapers"), wallpaperDir() },
        { QStringLiteral("media"), mediaDir() },
        { QStringLiteral("workshop"), workshopDir() },
        { QStringLiteral("imported"), importDir() },
        { QStringLiteral("ddeVideo"), ddeVideoDir() },
    };
    emit pathsChanged();
}

void AppController::readSettings()
{
    m_settings = {
        { QStringLiteral("language"), QStringLiteral("zh-CN") },
        { QStringLiteral("wallpaperSource"), QStringLiteral("auto") },
        { QStringLiteral("wallpaperApiKey"), QString() },
        { QStringLiteral("steamcmdPath"), QString() },
        { QStringLiteral("wallpaperEngineRendererPath"), QString() },
        { QStringLiteral("liveWallpaperMode"), QStringLiteral("auto") },
    };

    QFile file(statePath());
    if (file.open(QIODevice::ReadOnly)) {
        const QJsonObject object = QJsonDocument::fromJson(file.readAll()).object();
        for (auto it = object.begin(); it != object.end(); ++it)
            m_settings.insert(it.key(), it.value().toVariant());
    }
    emit settingsChanged();
}

void AppController::writeSettings()
{
    ensureDirectories();
    QJsonObject object;
    for (auto it = m_settings.cbegin(); it != m_settings.cend(); ++it)
        object.insert(it.key(), QJsonValue::fromVariant(it.value()));
    QFile file(statePath());
    if (file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        file.write(QJsonDocument(object).toJson(QJsonDocument::Indented));
}

void AppController::updateSetting(const QString &key, const QVariant &value)
{
    m_settings.insert(key, value);
    writeSettings();
    emit settingsChanged();
    if (key == QLatin1String("liveWallpaperMode"))
        checkDependencies();
}

void AppController::getJson(const QUrl &url, const JsonCallback &callback)
{
    getText(url, [this, callback](const QString &text) {
        const QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());
        if (doc.isNull()) {
            showToast(QStringLiteral("JSON 解析失败"));
            return;
        }
        callback(doc);
    });
}

void AppController::postJson(const QUrl &url, const QJsonObject &body, const JsonCallback &callback)
{
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    request.setRawHeader("User-Agent", userAgent());
    auto *reply = m_network.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply, callback]() {
        const QByteArray data = reply->readAll();
        const auto error = reply->error();
        const QString errorString = reply->errorString();
        reply->deleteLater();
        if (error != QNetworkReply::NoError) {
            showToast(errorString);
            return;
        }
        const QJsonDocument doc = QJsonDocument::fromJson(data);
        if (doc.isNull()) {
            showToast(QStringLiteral("JSON 解析失败"));
            return;
        }
        callback(doc);
    });
}

void AppController::getText(const QUrl &url, const TextCallback &callback)
{
    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", userAgent());
    request.setRawHeader("Accept", "text/html,application/json,image/avif,image/webp,*/*");
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, callback]() {
        const QByteArray data = reply->readAll();
        const auto error = reply->error();
        const QString errorString = reply->errorString();
        reply->deleteLater();
        if (error != QNetworkReply::NoError) {
            showToast(errorString);
            return;
        }
        callback(QString::fromUtf8(data));
    });
}

void AppController::downloadToFile(const QUrl &url, const QString &prefix, const QString &targetDir, const QString &fallbackSuffix, const FileCallback &callback)
{
    QDir().mkpath(targetDir);
    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", userAgent());
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, prefix, targetDir, fallbackSuffix, callback]() {
        const QByteArray data = reply->readAll();
        const auto error = reply->error();
        const QString errorString = reply->errorString();
        const QUrl finalUrl = reply->url();
        reply->deleteLater();
        if (error != QNetworkReply::NoError) {
            showToast(errorString);
            return;
        }

        QString suffix = QFileInfo(finalUrl.path()).suffix();
        if (suffix.isEmpty())
            suffix = fallbackSuffix.startsWith('.') ? fallbackSuffix.mid(1) : fallbackSuffix;
        if (suffix.isEmpty())
            suffix = QStringLiteral("bin");

        const QString name = sanitizeFileName(prefix).left(80);
        QString path = targetDir + QLatin1Char('/') + name + QLatin1Char('.') + suffix;
        for (int index = 1; QFileInfo::exists(path); ++index)
            path = targetDir + QLatin1Char('/') + name + QLatin1Char('-') + QString::number(index) + QLatin1Char('.') + suffix;

        QFile file(path);
        if (!file.open(QIODevice::WriteOnly)) {
            showToast(QStringLiteral("无法写入文件：") + path);
            return;
        }
        file.write(data);
        file.close();
        showToast(QStringLiteral("已下载：") + path);
        callback(path);
        loadLibrary();
    });
}

QString AppController::htmlAttr(const QString &tag, const QString &name)
{
    const QRegularExpression re(QStringLiteral(R"(%1\s*=\s*["']([^"']+)["'])").arg(QRegularExpression::escape(name)), QRegularExpression::CaseInsensitiveOption);
    return htmlDecode(re.match(tag).captured(1));
}

QString AppController::stripTags(QString text)
{
    text.replace(QRegularExpression(QStringLiteral("<script\\b[\\s\\S]*?</script>"), QRegularExpression::CaseInsensitiveOption), QString());
    text.replace(QRegularExpression(QStringLiteral("<style\\b[\\s\\S]*?</style>"), QRegularExpression::CaseInsensitiveOption), QString());
    text.replace(QRegularExpression(QStringLiteral("<[^>]+>")), QStringLiteral(" "));
    return htmlDecode(text).simplified();
}

QString AppController::htmlDecode(QString text)
{
    text.replace(QStringLiteral("&amp;"), QStringLiteral("&"));
    text.replace(QStringLiteral("&quot;"), QStringLiteral("\""));
    text.replace(QStringLiteral("&#39;"), QStringLiteral("'"));
    text.replace(QStringLiteral("&apos;"), QStringLiteral("'"));
    text.replace(QStringLiteral("&lt;"), QStringLiteral("<"));
    text.replace(QStringLiteral("&gt;"), QStringLiteral(">"));
    text.replace(QStringLiteral("&nbsp;"), QStringLiteral(" "));
    return text;
}

QString AppController::absoluteUrl(const QString &value, const QString &base)
{
    if (value.trimmed().isEmpty())
        return {};
    return QUrl(base).resolved(QUrl(htmlDecode(value.trimmed()))).toString();
}

QString AppController::sanitizeFileName(QString value)
{
    value = value.simplified();
    value.replace(QRegularExpression(QStringLiteral(R"([\\/:*?"<>|]+)")), QStringLiteral("-"));
    value.replace(QRegularExpression(QStringLiteral(R"(\s+)")), QStringLiteral("-"));
    value = value.trimmed();
    return value.isEmpty() ? QStringLiteral("waifux-download") : value;
}

QVariantMap AppController::itemMap(const QString &id, const QString &title, const QString &kind)
{
    return {
        { QStringLiteral("id"), id },
        { QStringLiteral("title"), title },
        { QStringLiteral("kind"), kind },
    };
}

QVariantMap AppController::normalizeWallhaven(const QJsonObject &object) const
{
    QVariantMap item = itemMap(object.value(QStringLiteral("id")).toString(), object.value(QStringLiteral("id")).toString(), QStringLiteral("wallpaper"));
    const QJsonObject thumbs = object.value(QStringLiteral("thumbs")).toObject();
    item.insert(QStringLiteral("source"), QStringLiteral("wallhaven"));
    item.insert(QStringLiteral("title"), object.value(QStringLiteral("id")).toString(QStringLiteral("Wallhaven")));
    item.insert(QStringLiteral("url"), object.value(QStringLiteral("url")).toString());
    item.insert(QStringLiteral("image"), object.value(QStringLiteral("path")).toString());
    item.insert(QStringLiteral("preview"), thumbs.value(QStringLiteral("large")).toString(thumbs.value(QStringLiteral("original")).toString()));
    item.insert(QStringLiteral("thumbnail"), thumbs.value(QStringLiteral("small")).toString(item.value(QStringLiteral("preview")).toString()));
    item.insert(QStringLiteral("resolution"), object.value(QStringLiteral("resolution")).toString());
    item.insert(QStringLiteral("purity"), object.value(QStringLiteral("purity")).toString());
    item.insert(QStringLiteral("category"), object.value(QStringLiteral("category")).toString());
    QVariantList tags;
    const QJsonArray tagArray = object.value(QStringLiteral("tags")).toArray();
    for (const QJsonValue &value : tagArray)
        tags << value.toObject().value(QStringLiteral("name")).toString();
    item.insert(QStringLiteral("tags"), tags);
    return item;
}

QVariantList AppController::parseFourKWallpapers(const QString &html) const
{
    QVariantList items;
    QRegularExpression blockRe(QStringLiteral(R"(<p\b[^>]*class=["'][^"']*wallpapers__item[^"']*["'][\s\S]*?</p>)"), QRegularExpression::CaseInsensitiveOption);
    auto it = blockRe.globalMatch(html);
    while (it.hasNext()) {
        const QString block = it.next().captured(0);
        const QString img = QRegularExpression(QStringLiteral(R"(<img\b[^>]*>)"), QRegularExpression::CaseInsensitiveOption).match(block).captured(0);
        const QString link = QRegularExpression(QStringLiteral(R"(<a\b[^>]*href=["'][^"']+["'][^>]*>)"), QRegularExpression::CaseInsensitiveOption).match(block).captured(0);
        const QString thumb = absoluteUrl(htmlAttr(img, QStringLiteral("src")).isEmpty() ? htmlAttr(img, QStringLiteral("data-src")) : htmlAttr(img, QStringLiteral("src")), FourKBase);
        const QString detail = absoluteUrl(htmlAttr(link, QStringLiteral("href")), FourKBase);
        if (thumb.isEmpty() || detail.isEmpty())
            continue;
        const QString id = QString::number(qHash(detail));
        QVariantMap item = itemMap(QStringLiteral("4k_") + id, stripTags(block).left(80), QStringLiteral("wallpaper"));
        item.insert(QStringLiteral("source"), QStringLiteral("4kwallpapers"));
        item.insert(QStringLiteral("url"), detail);
        item.insert(QStringLiteral("thumbnail"), thumb);
        item.insert(QStringLiteral("preview"), thumb);
        item.insert(QStringLiteral("image"), thumb);
        item.insert(QStringLiteral("resolution"), QStringLiteral("4K"));
        items << item;
    }
    return items;
}

QVariantList AppController::parseMotionItems(const QString &html) const
{
    QVariantList items;
    QSet<QString> seen;
    QRegularExpression linkRe(QStringLiteral(R"(<a\b[^>]*>[\s\S]*?</a>)"), QRegularExpression::CaseInsensitiveOption);
    auto it = linkRe.globalMatch(html);
    while (it.hasNext()) {
        const QString block = it.next().captured(0);
        const QString page = absoluteUrl(htmlAttr(block, QStringLiteral("href")), MotionBase);
        if (page.isEmpty())
            continue;
        const QUrl pageUrl(page);
        const QString path = pageUrl.path();
        if (path.isEmpty() || path == QLatin1String("/") || path.startsWith(QStringLiteral("/tag:")) || path.startsWith(QStringLiteral("/cdn-cgi/")) || seen.contains(path))
            continue;
        const QString signal = (htmlAttr(block, QStringLiteral("title")) + QLatin1Char(' ') + stripTags(block)).toLower();
        if (!signal.contains(QStringLiteral("live wallpaper")))
            continue;
        seen.insert(path);

        const QString img = QRegularExpression(QStringLiteral(R"(<img\b[^>]*>)"), QRegularExpression::CaseInsensitiveOption).match(block).captured(0);
        const QString thumbnail = absoluteUrl(!htmlAttr(img, QStringLiteral("data-src")).isEmpty() ? htmlAttr(img, QStringLiteral("data-src")) : htmlAttr(img, QStringLiteral("src")), MotionBase);
        QString title = htmlAttr(block, QStringLiteral("title"));
        title.remove(QRegularExpression(QStringLiteral("live wallpaper"), QRegularExpression::CaseInsensitiveOption));
        if (title.trimmed().isEmpty())
            title = QFileInfo(path).fileName().replace(QLatin1Char('-'), QLatin1Char(' '));

        QVariantMap item = itemMap(QString::fromUtf8(path.toUtf8().toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals)), title.simplified(), QStringLiteral("media"));
        item.insert(QStringLiteral("source"), QStringLiteral("motionbgs"));
        item.insert(QStringLiteral("pageURL"), page);
        item.insert(QStringLiteral("thumbnail"), thumbnail);
        item.insert(QStringLiteral("poster"), thumbnail);
        item.insert(QStringLiteral("resolution"), block.contains(QStringLiteral("4K"), Qt::CaseInsensitive) ? QStringLiteral("4K") : QStringLiteral("HD"));
        items << item;
    }
    return items;
}

QVariantMap AppController::parseMotionDetail(const QString &html, const QVariantMap &base) const
{
    QVariantMap item = base;
    const QString videoTag = QRegularExpression(QStringLiteral(R"(<video\b[^>]*>)"), QRegularExpression::CaseInsensitiveOption).match(html).captured(0);
    QString poster = absoluteUrl(htmlAttr(videoTag, QStringLiteral("poster")), MotionBase);
    if (poster.isEmpty())
        poster = base.value(QStringLiteral("poster")).toString();

    QString video;
    QRegularExpression sourceRe(QStringLiteral(R"(<source\b[^>]*src=["']([^"']+\.(?:mp4|webm)[^"']*)["'][^>]*>)"), QRegularExpression::CaseInsensitiveOption);
    const auto sourceMatch = sourceRe.match(html);
    if (sourceMatch.hasMatch())
        video = absoluteUrl(sourceMatch.captured(1), MotionBase);

    QVariantList options;
    QRegularExpression downloadRe(QStringLiteral(R"(<a\b[^>]*href=["']([^"']*(?:/dl/|\.mp4|\.webm)[^"']*)["'][^>]*>([\s\S]*?)</a>)"), QRegularExpression::CaseInsensitiveOption);
    auto it = downloadRe.globalMatch(html);
    while (it.hasNext()) {
        const auto match = it.next();
        QVariantMap option;
        option.insert(QStringLiteral("remoteURL"), absoluteUrl(match.captured(1), MotionBase));
        option.insert(QStringLiteral("label"), stripTags(match.captured(2)).isEmpty() ? QStringLiteral("下载") : stripTags(match.captured(2)));
        options << option;
    }
    if (options.isEmpty() && !video.isEmpty()) {
        options << QVariantMap {
            { QStringLiteral("remoteURL"), video },
            { QStringLiteral("label"), QStringLiteral("预览视频") },
        };
    }

    item.insert(QStringLiteral("poster"), poster);
    item.insert(QStringLiteral("previewVideoURL"), video);
    item.insert(QStringLiteral("downloadOptions"), options);
    return item;
}

QVariantMap AppController::normalizeBangumi(const QJsonObject &object) const
{
    const QJsonObject images = object.value(QStringLiteral("images")).toObject();
    QString image = images.value(QStringLiteral("large")).toString();
    if (image.isEmpty()) image = images.value(QStringLiteral("common")).toString();
    if (image.isEmpty()) image = images.value(QStringLiteral("medium")).toString();
    image.replace(QStringLiteral("http:"), QStringLiteral("https:"));

    QVariantMap item = itemMap(QString::number(object.value(QStringLiteral("id")).toInt()), object.value(QStringLiteral("name_cn")).toString(object.value(QStringLiteral("name")).toString()), QStringLiteral("anime"));
    item.insert(QStringLiteral("source"), QStringLiteral("bangumi"));
    item.insert(QStringLiteral("originalTitle"), object.value(QStringLiteral("name")).toString());
    item.insert(QStringLiteral("summary"), object.value(QStringLiteral("summary")).toString());
    item.insert(QStringLiteral("thumbnail"), image);
    item.insert(QStringLiteral("rating"), object.value(QStringLiteral("rating")).toObject().value(QStringLiteral("score")).toDouble());
    item.insert(QStringLiteral("rank"), object.value(QStringLiteral("rank")).toInt());
    item.insert(QStringLiteral("url"), QStringLiteral("https://bgm.tv/subject/") + item.value(QStringLiteral("id")).toString());
    return item;
}

QVariantList AppController::parseWorkshopItems(const QString &html) const
{
    QVariantList items;
    QSet<QString> seen;
    QRegularExpression re(QStringLiteral(R"(<a\b[^>]*href=["']([^"']*sharedfiles/filedetails/\?id=(\d+)[^"']*)["'][^>]*>[\s\S]*?</a>)"), QRegularExpression::CaseInsensitiveOption);
    auto it = re.globalMatch(html);
    while (it.hasNext()) {
        const auto match = it.next();
        const QString id = match.captured(2);
        if (seen.contains(id))
            continue;
        seen.insert(id);
        const QString block = match.captured(0);
        const QString img = QRegularExpression(QStringLiteral(R"(<img\b[^>]*>)"), QRegularExpression::CaseInsensitiveOption).match(block).captured(0);
        QVariantMap item = itemMap(id, htmlAttr(img, QStringLiteral("alt")).isEmpty() ? QStringLiteral("Workshop ") + id : htmlAttr(img, QStringLiteral("alt")), QStringLiteral("workshop"));
        item.insert(QStringLiteral("source"), QStringLiteral("steam-workshop"));
        item.insert(QStringLiteral("pageURL"), QStringLiteral("https://steamcommunity.com/sharedfiles/filedetails/?id=") + id);
        item.insert(QStringLiteral("thumbnail"), absoluteUrl(htmlAttr(img, QStringLiteral("src")), SteamBase));
        item.insert(QStringLiteral("poster"), item.value(QStringLiteral("thumbnail")).toString());
        item.insert(QStringLiteral("type"), QStringLiteral("Wallpaper Engine"));
        items << item;
    }
    return items;
}

void AppController::loadHome()
{
    loadWallpapers(QString(), 1);
    loadMedia(QString(), 1);
    loadWorkshop(QString(), 1);
    loadAnime(QString(), 1);
}

void AppController::loadWallpapers(const QString &query, int page)
{
    setLoading(true);
    const QString source = m_settings.value(QStringLiteral("wallpaperSource"), QStringLiteral("auto")).toString();
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("page"), QString::number(std::max(1, page)));
    q.addQueryItem(QStringLiteral("sorting"), QStringLiteral("favorites"));
    q.addQueryItem(QStringLiteral("purity"), m_settings.value(QStringLiteral("wallpaperApiKey")).toString().isEmpty() ? QStringLiteral("100") : QStringLiteral("111"));
    q.addQueryItem(QStringLiteral("categories"), QStringLiteral("111"));
    if (!query.trimmed().isEmpty())
        q.addQueryItem(QStringLiteral("q"), query.trimmed());

    const auto fallbackFourK = [this, query, page]() {
        QUrlQuery fq;
        if (!query.trimmed().isEmpty())
            fq.addQueryItem(QStringLiteral("q"), query.trimmed());
        if (page > 1)
            fq.addQueryItem(QStringLiteral("page"), QString::number(page));
        const QUrl url = query.trimmed().isEmpty()
            ? QUrl(constantString(FourKBase) + QStringLiteral("/most-popular-4k-wallpapers/"))
            : withQuery(constantString(FourKBase) + QStringLiteral("/search/"), fq);
        getText(url, [this](const QString &html) {
            m_wallpapers = parseFourKWallpapers(html);
            emit wallpapersChanged();
            setLoading(false);
        });
    };

    if (source == QLatin1String("4kwallpapers")) {
        fallbackFourK();
        return;
    }

    QNetworkRequest request(withQuery(constantString(WallhavenApi) + QStringLiteral("/search"), q));
    request.setRawHeader("User-Agent", userAgent());
    const QString apiKey = m_settings.value(QStringLiteral("wallpaperApiKey")).toString();
    if (!apiKey.isEmpty())
        request.setRawHeader("X-API-Key", apiKey.toUtf8());
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, source, fallbackFourK]() {
        const QByteArray bytes = reply->readAll();
        const auto error = reply->error();
        const QString errorString = reply->errorString();
        reply->deleteLater();
        if (error != QNetworkReply::NoError) {
            if (source == QLatin1String("auto")) {
                showToast(QStringLiteral("Wallhaven 加载失败，切换 4KWallpapers：") + errorString);
                fallbackFourK();
            } else {
                showToast(errorString);
                setLoading(false);
            }
            return;
        }
        const QJsonArray data = QJsonDocument::fromJson(bytes).object().value(QStringLiteral("data")).toArray();
        QVariantList items;
        for (const QJsonValue &value : data)
            items << normalizeWallhaven(value.toObject());
        m_wallpapers = items;
        emit wallpapersChanged();
        setLoading(false);
    });
}

void AppController::loadMedia(const QString &query, int page)
{
    if (m_mediaMode == 2) {
        loadLibrary();
        return;
    }
    if (m_mediaMode == 1) {
        loadWorkshop(query, page);
        return;
    }

    setLoading(true);
    m_mediaPage = std::max(1, page);
    QString path = QStringLiteral("/");
    QUrlQuery q;
    if (!query.trimmed().isEmpty()) {
        path = QStringLiteral("/search");
        q.addQueryItem(QStringLiteral("q"), query.trimmed());
    } else if (m_mediaPage > 1) {
        path = QStringLiteral("/") + QString::number(m_mediaPage) + QStringLiteral("/");
    }
    const QUrl url = q.isEmpty() ? QUrl(constantString(MotionBase) + path) : withQuery(constantString(MotionBase) + path, q);
    getText(url, [this](const QString &html) {
        m_media = parseMotionItems(html);
        emit mediaChanged();
        setLoading(false);
    });
}

void AppController::loadAnime(const QString &query, int page)
{
    setLoading(true);
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("limit"), QStringLiteral("24"));
    q.addQueryItem(QStringLiteral("offset"), QString::number((std::max(1, page) - 1) * 24));
    QJsonObject body {
        { QStringLiteral("sort"), query.trimmed().isEmpty() ? QStringLiteral("heat") : QStringLiteral("match") },
        { QStringLiteral("filter"), QJsonObject { { QStringLiteral("type"), QJsonArray { 2 } } } },
    };
    if (!query.trimmed().isEmpty())
        body.insert(QStringLiteral("keyword"), query.trimmed());
    postJson(withQuery(constantString(BangumiApi) + QStringLiteral("/v0/search/subjects"), q), body, [this](const QJsonDocument &doc) {
        QVariantList items;
        const QJsonArray data = doc.object().value(QStringLiteral("data")).toArray();
        for (const QJsonValue &value : data)
            items << normalizeBangumi(value.toObject());
        m_anime = items;
        emit animeChanged();
        setLoading(false);
    });
}

void AppController::loadWorkshop(const QString &query, int page)
{
    setLoading(true);
    m_workshopPage = std::max(1, page);
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("appid"), constantString(WallpaperEngineAppId));
    q.addQueryItem(QStringLiteral("searchtext"), query.trimmed());
    q.addQueryItem(QStringLiteral("child_publishedfileid"), QStringLiteral("0"));
    q.addQueryItem(QStringLiteral("browsesort"), QStringLiteral("trend"));
    q.addQueryItem(QStringLiteral("section"), QStringLiteral("readytouseitems"));
    q.addQueryItem(QStringLiteral("created_filetype"), QStringLiteral("0"));
    q.addQueryItem(QStringLiteral("updated_filters"), QStringLiteral("1"));
    q.addQueryItem(QStringLiteral("p"), QString::number(m_workshopPage));
    q.addQueryItem(QStringLiteral("num_per_page"), QStringLiteral("24"));
    q.addQueryItem(QStringLiteral("requiredtags[]"), QStringLiteral("Everyone"));
    getText(withQuery(constantString(SteamBase) + QStringLiteral("/workshop/browse/"), q), [this](const QString &html) {
        m_workshop = parseWorkshopItems(html);
        emit workshopChanged();
        setLoading(false);
    });
}

QVariantList AppController::scanFiles(const QString &root, const QStringList &suffixes, const QString &kind) const
{
    QVariantList items;
    if (!QDir(root).exists())
        return items;
    QDirIterator it(root, QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const QString path = it.next();
        const QFileInfo info(path);
        if (!suffixes.contains(info.suffix().toLower()))
            continue;
        QVariantMap item = itemMap(QString::fromUtf8(path.toUtf8().toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals)), info.fileName(), kind);
        item.insert(QStringLiteral("path"), path);
        item.insert(QStringLiteral("url"), QUrl::fromLocalFile(path).toString());
        item.insert(QStringLiteral("thumbnail"), QUrl::fromLocalFile(path).toString());
        item.insert(QStringLiteral("size"), info.size());
        item.insert(QStringLiteral("mtime"), info.lastModified().toMSecsSinceEpoch());
        items << item;
    }
    std::sort(items.begin(), items.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value(QStringLiteral("mtime")).toLongLong() > b.toMap().value(QStringLiteral("mtime")).toLongLong();
    });
    return items;
}

void AppController::loadLibrary()
{
    ensureDirectories();
    m_libraryWallpapers = scanFiles(wallpaperDir(), { QStringLiteral("jpg"), QStringLiteral("jpeg"), QStringLiteral("png"), QStringLiteral("webp"), QStringLiteral("gif") }, QStringLiteral("wallpaper"));
    const QVariantList legacy = scanFiles(downloadRoot(), { QStringLiteral("jpg"), QStringLiteral("jpeg"), QStringLiteral("png"), QStringLiteral("webp"), QStringLiteral("gif") }, QStringLiteral("wallpaper"));
    for (const QVariant &value : legacy) {
        const QString path = value.toMap().value(QStringLiteral("path")).toString();
        if (QFileInfo(path).absolutePath() == downloadRoot())
            m_libraryWallpapers << value;
    }
    m_libraryMedia = scanFiles(mediaDir(), { QStringLiteral("mp4"), QStringLiteral("webm"), QStringLiteral("mkv"), QStringLiteral("mov") }, QStringLiteral("media"));

    QVariantList workshopItems;
    QDir dir(workshopDir());
    for (const QFileInfo &info : dir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        QVariantMap item = itemMap(info.fileName(), info.fileName(), QStringLiteral("workshop"));
        item.insert(QStringLiteral("path"), info.absoluteFilePath());
        workshopItems << item;
    }
    m_libraryWorkshop = workshopItems;
    emit libraryChanged();
}

bool AppController::commandExists(const QString &command) const
{
    return !commandPath(command).isEmpty();
}

QString AppController::commandPath(const QString &command) const
{
    if (command.contains(QLatin1Char('/'))) {
        QFileInfo info(command);
        return info.exists() && info.isExecutable() ? info.absoluteFilePath() : QString();
    }
    return QStandardPaths::findExecutable(command);
}

bool AppController::run(const QString &program, const QStringList &arguments, int timeoutMs) const
{
    QProcess process;
    process.start(program, arguments);
    if (!process.waitForFinished(timeoutMs))
        return false;
    return process.exitStatus() == QProcess::NormalExit && process.exitCode() == 0;
}

QString AppController::runOutput(const QString &program, const QStringList &arguments, int timeoutMs) const
{
    QProcess process;
    process.start(program, arguments);
    if (!process.waitForFinished(timeoutMs))
        return {};
    return QString::fromUtf8(process.readAllStandardOutput()).trimmed();
}

bool AppController::isDeepinDdeX11() const
{
    const QString desktop = (env("XDG_CURRENT_DESKTOP") + QLatin1Char(' ') + env("DESKTOP_SESSION")).toLower();
    return !env("DISPLAY").isEmpty() && env("WAYLAND_DISPLAY").isEmpty() && (desktop.contains(QStringLiteral("dde")) || desktop.contains(QStringLiteral("deepin")));
}

QVariantMap AppController::deepinNativeStatus() const
{
    QString pluginPath;
    for (const QString &candidate : ddePluginPaths()) {
        if (QFileInfo::exists(candidate)) {
            pluginPath = candidate;
            break;
        }
    }

    const QString packageVersion = runOutput(QStringLiteral("dpkg-query"), { QStringLiteral("-W"), QStringLiteral("-f=${Version}"), constantString(DdePluginPackage) }, 2500);
    const bool hasLibMpv = runOutput(QStringLiteral("ldconfig"), { QStringLiteral("-p") }, 2500).contains(QRegularExpression(QStringLiteral(R"(\blibmpv\.so\b)")));
    const bool hasConfig = commandExists(QStringLiteral("dde-dconfig"));
    bool enabled = false;
    if (hasConfig) {
        enabled = runOutput(QStringLiteral("dde-dconfig"), {
            QStringLiteral("get"), QStringLiteral("-a"), QStringLiteral("org.deepin.dde.file-manager"),
            QStringLiteral("-r"), QStringLiteral("org.deepin.dde.file-manager.desktop.videowallpaper"),
            QStringLiteral("-k"), QStringLiteral("enable"),
        }, 3000) == QLatin1String("true");
    }
    const bool versionOk = !packageVersion.isEmpty()
        && run(QStringLiteral("dpkg"), { QStringLiteral("--compare-versions"), packageVersion, QStringLiteral("ge"), constantString(DdePluginMinVersion) }, 2500);
    const bool ok = !pluginPath.isEmpty() && hasConfig && hasLibMpv && versionOk;
    return {
        { QStringLiteral("ok"), ok },
        { QStringLiteral("pluginPath"), pluginPath },
        { QStringLiteral("packageVersion"), packageVersion },
        { QStringLiteral("requiredPackageVersion"), constantString(DdePluginMinVersion) },
        { QStringLiteral("configReadable"), hasConfig },
        { QStringLiteral("enabled"), enabled },
        { QStringLiteral("libMpvOk"), hasLibMpv },
        { QStringLiteral("issue"), ok ? QString() : QStringLiteral("deepin 原生视频壁纸插件、DConfig、libmpv.so 或 WaifuX 插件版本不完整。") },
    };
}

void AppController::checkDependencies()
{
    const QStringList names = {
        QStringLiteral("dde-dconfig"), QStringLiteral("gsettings"), QStringLiteral("xdg-open"),
        QStringLiteral("plasma-apply-wallpaperimage"), QStringLiteral("xfconf-query"),
        QStringLiteral("swaymsg"), QStringLiteral("swww"), QStringLiteral("ffmpeg"), QStringLiteral("mpv"),
        QStringLiteral("xwinwrap"), QStringLiteral("mpvpaper"), QStringLiteral("xprop"), QStringLiteral("xwininfo"),
        QStringLiteral("xdotool"), QStringLiteral("wmctrl"), QStringLiteral("feh"), QStringLiteral("steamcmd"),
        QStringLiteral("linux-wallpaperengine")
    };
    QVariantList deps;
    for (const QString &name : names) {
        deps << QVariantMap {
            { QStringLiteral("name"), name },
            { QStringLiteral("ok"), commandExists(name) },
            { QStringLiteral("path"), commandPath(name) },
        };
    }
    deps << QVariantMap {
        { QStringLiteral("name"), QStringLiteral("deepin-native-video") },
        { QStringLiteral("ok"), deepinNativeStatus().value(QStringLiteral("ok")).toBool() },
        { QStringLiteral("path"), deepinNativeStatus().value(QStringLiteral("pluginPath")).toString() },
    };
    m_dependencies = deps;
    emit dependenciesChanged();
}

void AppController::writeDependencyInstallScript()
{
    ensureDirectories();
    checkDependencies();

    QStringList packages;
    const auto addPackage = [&packages](const QString &packageName) {
        if (!packages.contains(packageName))
            packages << packageName;
    };

    if (!commandExists(QStringLiteral("xdg-open")))
        addPackage(QStringLiteral("xdg-utils"));
    if (!commandExists(QStringLiteral("ffmpeg")))
        addPackage(QStringLiteral("ffmpeg"));
    if (!commandExists(QStringLiteral("mpv")))
        addPackage(QStringLiteral("mpv"));
    if (!commandExists(QStringLiteral("xprop")) || !commandExists(QStringLiteral("xwininfo")))
        addPackage(QStringLiteral("x11-utils"));
    if (!commandExists(QStringLiteral("xdotool")))
        addPackage(QStringLiteral("xdotool"));
    if (!commandExists(QStringLiteral("wmctrl")))
        addPackage(QStringLiteral("wmctrl"));
    if (!commandExists(QStringLiteral("feh")))
        addPackage(QStringLiteral("feh"));
    if (!commandExists(QStringLiteral("steamcmd")))
        addPackage(QStringLiteral("steamcmd"));
    const QString path = cacheDir() + QStringLiteral("/install-linux-dependencies.sh");
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
        showToast(QStringLiteral("无法写入依赖安装脚本：") + path);
        return;
    }

    QTextStream out(&file);
    out << "#!/usr/bin/env bash\n";
    out << "set -euo pipefail\n\n";
    out << "# WaifuX Linux dependency helper generated by the Qt/QML app.\n";
    out << "# Review the package list before running it on another distribution.\n\n";
    if (packages.isEmpty()) {
        out << "echo \"WaifuX 未发现常用运行依赖缺失。\"\n";
    } else {
        out << "sudo apt-get update\n";
        out << "sudo apt-get install -y";
        for (const QString &packageName : packages)
            out << " " << packageName;
        out << "\n";
    }
    out << "\n";
    out << "cat <<'INFO'\n";
    out << "deepin/DDE X11 原生视频壁纸还需要发布包中的 waifux-dde-video-wallpaper-plugin_*.deb。\n";
    out << "如果 apt 仓库没有 xwinwrap、mpvpaper 或 swww，请按发行版文档安装对应动态壁纸工具。\n";
    out << "INFO\n";
    file.close();
    QFile::setPermissions(path, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner
        | QFileDevice::ReadGroup | QFileDevice::ExeGroup | QFileDevice::ReadOther | QFileDevice::ExeOther);
    showToast(QStringLiteral("已生成依赖安装脚本：") + path);
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(path).absolutePath()));
}

bool AppController::setLinuxWallpaper(const QString &filePath, QString *appliedBy) const
{
    const QString uri = QUrl::fromLocalFile(filePath).toString();
    if (isDeepinDdeX11() && commandExists(QStringLiteral("gsettings"))) {
        if (run(QStringLiteral("gsettings"), { QStringLiteral("set"), QStringLiteral("com.deepin.wrap.gnome.desktop.background"), QStringLiteral("picture-uri"), uri }, 3000)
            || run(QStringLiteral("gsettings"), { QStringLiteral("set"), QStringLiteral("com.deepin.dde.appearance"), QStringLiteral("background-uris"), QStringLiteral("['") + uri + QStringLiteral("']") }, 3000)) {
            if (appliedBy) *appliedBy = QStringLiteral("deepin/gsettings");
            return true;
        }
    }
    if (commandExists(QStringLiteral("plasma-apply-wallpaperimage")) && run(QStringLiteral("plasma-apply-wallpaperimage"), { filePath }, 5000)) {
        if (appliedBy) *appliedBy = QStringLiteral("KDE Plasma");
        return true;
    }
    if (commandExists(QStringLiteral("gsettings"))) {
        bool ok = run(QStringLiteral("gsettings"), { QStringLiteral("set"), QStringLiteral("org.gnome.desktop.background"), QStringLiteral("picture-uri"), uri }, 3000);
        ok = run(QStringLiteral("gsettings"), { QStringLiteral("set"), QStringLiteral("org.gnome.desktop.background"), QStringLiteral("picture-uri-dark"), uri }, 3000) || ok;
        if (ok) {
            if (appliedBy) *appliedBy = QStringLiteral("gsettings");
            return true;
        }
    }
    if (commandExists(QStringLiteral("xfconf-query")) && run(QStringLiteral("xfconf-query"), { QStringLiteral("-c"), QStringLiteral("xfce4-desktop"), QStringLiteral("-p"), QStringLiteral("/backdrop/screen0/monitor0/workspace0/last-image"), QStringLiteral("-s"), filePath }, 3000)) {
        if (appliedBy) *appliedBy = QStringLiteral("XFCE");
        return true;
    }
    if (commandExists(QStringLiteral("swww")) && run(QStringLiteral("swww"), { QStringLiteral("img"), filePath }, 3000)) {
        if (appliedBy) *appliedBy = QStringLiteral("swww");
        return true;
    }
    if (commandExists(QStringLiteral("feh")) && !env("DISPLAY").isEmpty() && run(QStringLiteral("feh"), { QStringLiteral("--bg-fill"), filePath }, 3000)) {
        if (appliedBy) *appliedBy = QStringLiteral("feh");
        return true;
    }
    return false;
}

QString AppController::localFilePathFromItem(const QVariantMap &item) const
{
    const QString path = item.value(QStringLiteral("path")).toString();
    if (!path.isEmpty())
        return path;
    const QString url = item.value(QStringLiteral("url")).toString();
    if (url.startsWith(QStringLiteral("file:")))
        return QUrl(url).toLocalFile();
    return {};
}

void AppController::downloadWallpaper(const QVariantMap &item)
{
    QString image = item.value(QStringLiteral("image")).toString();
    if (image.isEmpty())
        image = item.value(QStringLiteral("url")).toString();
    if (image.isEmpty()) {
        showToast(QStringLiteral("缺少壁纸下载地址"));
        return;
    }
    QString source = item.value(QStringLiteral("source")).toString();
    if (source.isEmpty())
        source = QStringLiteral("wallpaper");
    QString id = item.value(QStringLiteral("id")).toString();
    if (id.isEmpty())
        id = item.value(QStringLiteral("title")).toString();
    downloadToFile(QUrl(image), source + QLatin1Char('-') + id, wallpaperDir(), QStringLiteral(".jpg"), [](const QString &) {});
}

void AppController::applyWallpaper(const QVariantMap &item)
{
    const QString local = localFilePathFromItem(item);
    if (!local.isEmpty()) {
        QString appliedBy;
        if (setLinuxWallpaper(local, &appliedBy))
            showToast(QStringLiteral("已设置壁纸：") + appliedBy);
        else
            showToast(QStringLiteral("未找到可用的 Linux 壁纸设置工具"));
        return;
    }
    QString image = item.value(QStringLiteral("image")).toString();
    if (image.isEmpty())
        image = item.value(QStringLiteral("url")).toString();
    if (image.isEmpty()) {
        showToast(QStringLiteral("缺少壁纸地址"));
        return;
    }
    QString id = item.value(QStringLiteral("id")).toString();
    if (id.isEmpty())
        id = item.value(QStringLiteral("title")).toString();
    downloadToFile(QUrl(image), QStringLiteral("wallpaper-") + id, wallpaperDir(), QStringLiteral(".jpg"), [this](const QString &path) {
        QString appliedBy;
        if (setLinuxWallpaper(path, &appliedBy))
            showToast(QStringLiteral("已设置壁纸：") + appliedBy);
        else
            showToast(QStringLiteral("下载成功，但未找到可用的 Linux 壁纸设置工具"));
    });
}

void AppController::downloadMedia(const QVariantMap &item)
{
    QVariantList options = item.value(QStringLiteral("downloadOptions")).toList();
    if (!options.isEmpty()) {
        const QVariantMap option = options.first().toMap();
        downloadToFile(QUrl(option.value(QStringLiteral("remoteURL")).toString()), QStringLiteral("motionbgs-") + item.value(QStringLiteral("title")).toString(), mediaDir(), QStringLiteral(".mp4"), [](const QString &) {});
        return;
    }

    const QString page = item.value(QStringLiteral("pageURL")).toString();
    if (page.isEmpty()) {
        showToast(QStringLiteral("缺少媒体详情地址"));
        return;
    }
    getText(QUrl(page), [this, item](const QString &html) {
        const QVariantMap detail = parseMotionDetail(html, item);
        const QVariantList options = detail.value(QStringLiteral("downloadOptions")).toList();
        if (options.isEmpty()) {
            showToast(QStringLiteral("未找到视频下载地址"));
            return;
        }
        const QVariantMap option = options.first().toMap();
        downloadToFile(QUrl(option.value(QStringLiteral("remoteURL")).toString()), QStringLiteral("motionbgs-") + detail.value(QStringLiteral("title")).toString(), mediaDir(), QStringLiteral(".mp4"), [](const QString &) {});
    });
}

void AppController::prepareDeepinVideo(const QString &filePath, const FileCallback &callback)
{
    QDir().mkpath(ddeVideoDir());
    const QString suffix = QFileInfo(filePath).suffix().isEmpty() ? QStringLiteral("mp4") : QFileInfo(filePath).suffix();
    const QString target = ddeVideoDir() + QStringLiteral("/000-waifux-current.") + suffix;
    QFile::remove(target);
    if (!QFile::link(filePath, target))
        QFile::copy(filePath, target);
    callback(target);
}

bool AppController::setDeepinVideoEnabled(bool enabled) const
{
    if (!commandExists(QStringLiteral("dde-dconfig")))
        return false;
    return run(QStringLiteral("dde-dconfig"), {
        QStringLiteral("set"), QStringLiteral("-a"), QStringLiteral("org.deepin.dde.file-manager"),
        QStringLiteral("-r"), QStringLiteral("org.deepin.dde.file-manager.desktop.videowallpaper"),
        QStringLiteral("-k"), QStringLiteral("enable"), QStringLiteral("-v"), enabled ? QStringLiteral("true") : QStringLiteral("false")
    }, 5000);
}

void AppController::fixDeepinDesktopWindowHints() const
{
    if (!isDeepinDdeX11() || !commandExists(QStringLiteral("wmctrl")))
        return;
    const QString output = runOutput(QStringLiteral("wmctrl"), { QStringLiteral("-l"), QStringLiteral("-x") }, 3000);
    for (const QString &line : output.split(QLatin1Char('\n'))) {
        if (!line.contains(QStringLiteral("dde-shell/desktop")) && !line.contains(QStringLiteral("org.deepin.dde-shell")))
            continue;
        const QString id = line.simplified().section(QLatin1Char(' '), 0, 0);
        if (id.isEmpty())
            continue;
        if (commandExists(QStringLiteral("xprop"))) {
            run(QStringLiteral("xprop"), { QStringLiteral("-id"), id, QStringLiteral("-f"), QStringLiteral("_NET_WM_WINDOW_TYPE"), QStringLiteral("32a"), QStringLiteral("-set"), QStringLiteral("_NET_WM_WINDOW_TYPE"), QStringLiteral("_NET_WM_WINDOW_TYPE_DESKTOP") }, 2000);
            run(QStringLiteral("xprop"), { QStringLiteral("-id"), id, QStringLiteral("-f"), QStringLiteral("_NET_WM_DESKTOP"), QStringLiteral("32c"), QStringLiteral("-set"), QStringLiteral("_NET_WM_DESKTOP"), QStringLiteral("0xffffffff") }, 2000);
        }
        for (const QString &state : { QStringLiteral("fullscreen"), QStringLiteral("below"), QStringLiteral("sticky"), QStringLiteral("skip_taskbar"), QStringLiteral("skip_pager") })
            run(QStringLiteral("wmctrl"), { QStringLiteral("-i"), QStringLiteral("-r"), id, QStringLiteral("-b"), QStringLiteral("add,") + state }, 2000);
    }
}

void AppController::startLiveProcess(const QString &program, const QStringList &arguments, const QString &label)
{
    stopTrackedLiveProcess();
    QFile log(liveWallpaperLogPath());
    QDir().mkpath(QFileInfo(log).absolutePath());
    if (log.open(QIODevice::Append))
        log.write(("\n===== " + QDateTime::currentDateTimeUtc().toString(Qt::ISODate) + " " + label + " =====\n").toUtf8());
    m_liveProcess = new QProcess(this);
    m_liveProcess->setProgram(program);
    m_liveProcess->setArguments(arguments);
    m_liveProcess->setStandardOutputFile(liveWallpaperLogPath(), QIODevice::Append);
    m_liveProcess->setStandardErrorFile(liveWallpaperLogPath(), QIODevice::Append);
    m_liveProcess->start();
    if (!m_liveProcess->waitForStarted(1400)) {
        showToast(QStringLiteral("动态壁纸启动失败：") + m_liveProcess->errorString());
        stopTrackedLiveProcess();
    }
}

void AppController::stopTrackedLiveProcess()
{
    if (!m_liveProcess)
        return;
    m_liveProcess->terminate();
    if (!m_liveProcess->waitForFinished(1200))
        m_liveProcess->kill();
    m_liveProcess->deleteLater();
    m_liveProcess = nullptr;
}

void AppController::applyLiveWallpaper(const QVariantMap &item)
{
    const QString local = localFilePathFromItem(item);
    if (local.isEmpty()) {
        downloadMedia(item);
        showToast(QStringLiteral("远程视频已开始下载，下载完成后可在本地媒体中应用。"));
        return;
    }

    stopLiveWallpaper();
    const QString mode = m_settings.value(QStringLiteral("liveWallpaperMode"), QStringLiteral("auto")).toString();
    if (isDeepinDdeX11() && mode != QLatin1String("xwinwrap-icon-overlay") && mode != QLatin1String("deepin-embedded-mpv")) {
        const QVariantMap status = deepinNativeStatus();
        if (!status.value(QStringLiteral("ok")).toBool()) {
            showToast(status.value(QStringLiteral("issue")).toString());
            return;
        }
        prepareDeepinVideo(local, [this](const QString &) {
            fixDeepinDesktopWindowHints();
            setDeepinVideoEnabled(true);
            fixDeepinDesktopWindowHints();
            showToast(QStringLiteral("已应用 deepin 原生视频壁纸"));
        });
        return;
    }

    if (!env("WAYLAND_DISPLAY").isEmpty() && commandExists(QStringLiteral("mpvpaper"))) {
        startLiveProcess(QStringLiteral("mpvpaper"), { QStringLiteral("*"), local, QStringLiteral("-o"), QStringLiteral("no-audio loop-file=inf") }, QStringLiteral("mpvpaper"));
        showToast(QStringLiteral("已启动 mpvpaper 动态壁纸"));
        return;
    }

    if (!env("DISPLAY").isEmpty() && commandExists(QStringLiteral("xwinwrap")) && commandExists(QStringLiteral("mpv"))) {
        startLiveProcess(QStringLiteral("xwinwrap"), {
            QStringLiteral("-ov"), QStringLiteral("-fs"), QStringLiteral("-ni"), QStringLiteral("-b"), QStringLiteral("-nf"),
            QStringLiteral("-un"), QStringLiteral("-s"), QStringLiteral("-st"), QStringLiteral("-sp"), QStringLiteral("--"),
            QStringLiteral("sh"), QStringLiteral("-c"),
            QStringLiteral("exec mpv --wid=\"$1\" --vo=x11 --loop-file=inf --no-audio --no-osc --no-input-default-bindings --no-terminal --title=waifux-mpv \"$2\""),
            QStringLiteral("waifux-mpv"), QStringLiteral("WID"), local
        }, QStringLiteral("xwinwrap + mpv"));
        showToast(QStringLiteral("已启动 xwinwrap + mpv 动态壁纸"));
        return;
    }
    showToast(QStringLiteral("缺少动态壁纸依赖：deepin 插件、mpvpaper 或 X11 mpv+xwinwrap。"));
}

void AppController::stopLiveWallpaper()
{
    setDeepinVideoEnabled(false);
    stopTrackedLiveProcess();
    showToast(QStringLiteral("已停止动态壁纸"));
}

void AppController::downloadWorkshop(const QVariantMap &item)
{
    const QString id = item.value(QStringLiteral("id")).toString();
    const QString steamcmd = !m_settings.value(QStringLiteral("steamcmdPath")).toString().isEmpty()
        ? m_settings.value(QStringLiteral("steamcmdPath")).toString()
        : commandPath(QStringLiteral("steamcmd"));
    if (id.isEmpty() || steamcmd.isEmpty()) {
        showToast(QStringLiteral("缺少 Workshop ID 或 SteamCMD。"));
        return;
    }
    QDir().mkpath(workshopDir());
    QProcess *process = new QProcess(this);
    process->setProgram(steamcmd);
    process->setArguments({
        QStringLiteral("+force_install_dir"), workshopDir(),
        QStringLiteral("+login"), QStringLiteral("anonymous"),
        QStringLiteral("+workshop_download_item"), constantString(WallpaperEngineAppId), id,
        QStringLiteral("+quit"),
    });
    connect(process, &QProcess::finished, this, [this, process](int code) {
        process->deleteLater();
        loadLibrary();
        showToast(code == 0 ? QStringLiteral("Workshop 下载完成") : QStringLiteral("Workshop 下载失败"));
    });
    process->start();
}

void AppController::applyWorkshop(const QVariantMap &item)
{
    const QString path = item.value(QStringLiteral("path")).toString();
    if (path.isEmpty()) {
        showToast(QStringLiteral("请先下载 Workshop 内容。"));
        return;
    }
    QDirIterator it(path, { QStringLiteral("*.mp4"), QStringLiteral("*.webm"), QStringLiteral("*.mkv"), QStringLiteral("*.mov") }, QDir::Files, QDirIterator::Subdirectories);
    if (it.hasNext()) {
        applyLiveWallpaper(QVariantMap { { QStringLiteral("path"), it.next() }, { QStringLiteral("kind"), QStringLiteral("media") } });
        return;
    }
    showToast(QStringLiteral("该 Workshop 项目中没有找到可直接播放的视频。"));
}

void AppController::openLibraryFolder()
{
    QDesktopServices::openUrl(QUrl::fromLocalFile(downloadRoot()));
}

void AppController::openExternal(const QString &url)
{
    QDesktopServices::openUrl(QUrl(url));
}

void AppController::importPath(const QString &path)
{
    const QFileInfo info(path);
    if (!info.exists()) {
        showToast(QStringLiteral("路径不存在"));
        return;
    }
    const QString suffix = info.suffix().toLower();
    const QString targetDir = QStringList { QStringLiteral("mp4"), QStringLiteral("webm"), QStringLiteral("mkv"), QStringLiteral("mov") }.contains(suffix) ? mediaDir() : importDir();
    const QString target = targetDir + QLatin1Char('/') + info.fileName();
    QFile::copy(path, target);
    loadLibrary();
    showToast(QStringLiteral("已导入：") + target);
}
